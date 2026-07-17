import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { fromZonedTime } from "date-fns-tz";
import { query, withTransaction } from "../../../db/binding";
import { assertPublicEndpoint, decryptSecret, encryptSecret, validateBaseUrl } from "./crypto";
import { bumpDataVersion, GtdError } from "./gtd";

export const NOTIFICATION_CHANNELS = ["email","webhook","bark","push"] as const;
export type NotificationChannel = typeof NOTIFICATION_CHANNELS[number];
export type ReminderRecord = { id:string; remindAt:string; timezone:string; channels:NotificationChannel[]; status:string };

type SettingsRow = { timezone:string; email_enabled:boolean; webhook_enabled:boolean; webhook_url:string; encrypted_webhook_secret:string; bark_enabled:boolean; bark_base_url:string; encrypted_bark_key:string };

export function validTimezone(timezone:string) {
  try { new Intl.DateTimeFormat("en", { timeZone:timezone }).format(); return true; } catch { return false; }
}

export function localDateTimeToUtc(localDateTime:string, timezone:string) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTime) || !validTimezone(timezone)) throw new GtdError("提醒日期、时间或时区无效",400);
  const date=fromZonedTime(localDateTime,timezone);
  if(Number.isNaN(date.getTime())) throw new GtdError("提醒日期和时间无效",400);
  return date;
}

async function ensureSettings(userId:string) {
  await query("INSERT INTO notification_settings(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[userId]);
}

export async function getNotificationSettings(userId:string) {
  await ensureSettings(userId);
  const [result,mail,push] = await Promise.all([
    query<SettingsRow>("SELECT timezone,email_enabled,webhook_enabled,webhook_url,encrypted_webhook_secret,bark_enabled,bark_base_url,encrypted_bark_key FROM notification_settings WHERE user_id=$1",[userId]),
    query("SELECT 1 FROM smtp_configs WHERE id=1"),
    query<{count:string}>("SELECT COUNT(*)::text AS count FROM push_subscriptions WHERE user_id=$1 AND enabled",[userId]),
  ]);
  const row=result.rows[0];
  return { timezone:row.timezone, emailEnabled:row.email_enabled, emailAvailable:Boolean(mail.rowCount), webhookEnabled:row.webhook_enabled, webhookUrl:row.webhook_url, hasWebhookSecret:Boolean(row.encrypted_webhook_secret), barkEnabled:row.bark_enabled, barkBaseUrl:row.bark_base_url, hasBarkKey:Boolean(row.encrypted_bark_key), pushAvailable:Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT), pushSubscriptionCount:Number(push.rows[0]?.count||0), vapidPublicKey:process.env.VAPID_PUBLIC_KEY||"" };
}

export async function updateNotificationSettings(userId:string,body:any) {
  await ensureSettings(userId);
  const current=(await query<SettingsRow>("SELECT timezone,email_enabled,webhook_enabled,webhook_url,encrypted_webhook_secret,bark_enabled,bark_base_url,encrypted_bark_key FROM notification_settings WHERE user_id=$1",[userId])).rows[0];
  const timezone=String(body.timezone||current.timezone); if(!validTimezone(timezone)) throw new GtdError("时区无效",400);
  const webhookUrl=String(body.webhookUrl??current.webhook_url).trim();
  const barkBaseUrl=String(body.barkBaseUrl??(current.bark_base_url||"https://api.day.app")).trim();
  const webhookEnabled=body.webhookEnabled??current.webhook_enabled,barkEnabled=body.barkEnabled??current.bark_enabled;
  if(webhookEnabled){const url=validateBaseUrl(webhookUrl);await assertPublicEndpoint(url);}
  const cleanBark=validateBaseUrl(barkBaseUrl); if(barkEnabled)await assertPublicEndpoint(cleanBark);
  const webhookSecret=body.webhookSecret ? await encryptSecret(String(body.webhookSecret)) : current.encrypted_webhook_secret || await encryptSecret(randomBytes(32).toString("base64url"));
  const barkKey=body.barkKey ? await encryptSecret(String(body.barkKey).trim()) : current.encrypted_bark_key;
  if(barkEnabled&&!barkKey) throw new GtdError("启用 Bark 前请填写 Device Key",400);
  await query(`UPDATE notification_settings SET timezone=$1,email_enabled=$2,webhook_enabled=$3,webhook_url=$4,encrypted_webhook_secret=$5,bark_enabled=$6,bark_base_url=$7,encrypted_bark_key=$8,updated_at=NOW() WHERE user_id=$9`,[timezone,body.emailEnabled??current.email_enabled,webhookEnabled,webhookUrl,webhookSecret,barkEnabled,cleanBark,barkKey,userId]);
  return getNotificationSettings(userId);
}

export async function getDecryptedNotificationSettings(userId:string) {
  await ensureSettings(userId); const row=(await query<SettingsRow>("SELECT timezone,email_enabled,webhook_enabled,webhook_url,encrypted_webhook_secret,bark_enabled,bark_base_url,encrypted_bark_key FROM notification_settings WHERE user_id=$1",[userId])).rows[0];
  return {...row,webhookSecret:row.encrypted_webhook_secret?await decryptSecret(row.encrypted_webhook_secret):"",barkKey:row.encrypted_bark_key?await decryptSecret(row.encrypted_bark_key):""};
}

export function webhookSignature(secret:string,payload:string){return `sha256=${createHmac("sha256",secret).update(payload).digest("hex")}`;}

export async function setTaskReminder(userId:string,taskId:string,input:{localDateTime?:string;timezone?:string;channels?:unknown}) {
  const channels=[...new Set(Array.isArray(input.channels)?input.channels:[])] as NotificationChannel[];
  if(!channels.length||channels.some(x=>!NOTIFICATION_CHANNELS.includes(x))) throw new GtdError("请至少选择一个有效提醒渠道",400);
  const settings=await getNotificationSettings(userId),timezone=String(input.timezone||settings.timezone),remindAt=localDateTimeToUtc(String(input.localDateTime||""),timezone);
  if(remindAt.getTime()<=Date.now()) throw new GtdError("提醒时间必须晚于当前时间",400);
  const available:{[K in NotificationChannel]:boolean}={email:settings.emailEnabled&&settings.emailAvailable,webhook:settings.webhookEnabled&&Boolean(settings.webhookUrl),bark:settings.barkEnabled&&settings.hasBarkKey,push:settings.pushAvailable&&settings.pushSubscriptionCount>0};
  const unavailable=channels.filter(x=>!available[x]); if(unavailable.length) throw new GtdError(`渠道尚未配置或启用：${unavailable.join(", ")}`,400);
  return withTransaction(async client=>{
    const task=await client.query<{status:string}>("SELECT status FROM tasks WHERE id=$1 AND user_id=$2 FOR UPDATE",[taskId,userId]); if(!task.rowCount) throw new GtdError("任务不存在",404); if(task.rows[0].status==="done") throw new GtdError("已完成任务不能设置提醒",400);
    const id=randomUUID(); await client.query("DELETE FROM task_reminders WHERE task_id=$1 AND user_id=$2",[taskId,userId]);
    await client.query("INSERT INTO task_reminders(id,task_id,user_id,remind_at,timezone,channels,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'pending',NOW(),NOW())",[id,taskId,userId,remindAt,timezone,channels]);
    for(const channel of channels) await client.query("INSERT INTO reminder_deliveries(id,reminder_id,channel,status,attempts,next_attempt_at,created_at,updated_at) VALUES($1,$2,$3,'pending',0,$4,NOW(),NOW())",[randomUUID(),id,channel,remindAt]);
    await bumpDataVersion(client,userId); return {id,remindAt:remindAt.toISOString(),timezone,channels,status:"pending"} satisfies ReminderRecord;
  });
}

export async function deleteTaskReminder(userId:string,taskId:string) { return withTransaction(async client=>{const result=await client.query("DELETE FROM task_reminders WHERE task_id=$1 AND user_id=$2",[taskId,userId]);if(!result.rowCount)throw new GtdError("提醒不存在",404);const dataVersion=await bumpDataVersion(client,userId);return{ok:true,dataVersion};}); }

export async function publicEndpoint(value:string){const url=validateBaseUrl(value);await assertPublicEndpoint(url);return url;}
