import webpush from "web-push";
import { query } from "../../../db/binding";
import { getEmailConfig, sendMail } from "./mail";
import { getDecryptedNotificationSettings, publicEndpoint, webhookSignature, type NotificationChannel } from "./notifications";

export type NotificationPayload={version:1;event:"task.reminder";deliveryId:string;reminderId:string;occurredAt:string;task:{id:string;title:string;notes:string;dueDate?:string;projectId?:string};url:string};

const appUrl=()=>`https://${process.env.DOMAIN||"localhost"}`;

export async function sendNotification(userId:string,channel:NotificationChannel,payload:NotificationPayload){
  const settings=await getDecryptedNotificationSettings(userId);
  if(channel==="email"){
    if(!settings.email_enabled)throw new Error("Email 渠道未启用"); const config=await getEmailConfig();if(!config)throw new Error("邮件服务未配置");
    const user=(await query<{email:string}>("SELECT email FROM users WHERE id=$1",[userId])).rows[0];if(!user)throw new Error("用户不存在");
    await sendMail(config,user.email,`任务提醒：${payload.task.title}`,`${payload.task.title}\n${payload.task.notes||""}\n\n打开任务：${payload.url}`,`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;background:#151a1b;color:#eef4f3;border-radius:16px"><div style="color:#69d2c8;font-size:12px;letter-spacing:2px;font-weight:700">GTD FLOW · REMINDER</div><h1 style="font-size:22px">${escapeHtml(payload.task.title)}</h1>${payload.task.notes?`<p style="color:#aab4b3;white-space:pre-wrap">${escapeHtml(payload.task.notes)}</p>`:""}<a href="${payload.url}" style="display:inline-block;margin-top:18px;padding:10px 16px;background:#69d2c8;color:#10201e;text-decoration:none;border-radius:9px;font-weight:700">打开任务</a></div>`);return;
  }
  if(channel==="webhook"){
    if(!settings.webhook_enabled||!settings.webhook_url||!settings.webhookSecret)throw new Error("Webhook 渠道未配置");const endpoint=await publicEndpoint(settings.webhook_url);const body=JSON.stringify(payload);
    const response=await fetch(endpoint,{method:"POST",redirect:"manual",headers:{"Content-Type":"application/json","Idempotency-Key":payload.deliveryId,"X-GTD-Event":payload.event,"X-GTD-Delivery":payload.deliveryId,"X-GTD-Signature":webhookSignature(settings.webhookSecret,body)},body,signal:AbortSignal.timeout(15_000)});if(!response.ok)throw new Error(`Webhook 返回 ${response.status}`);return;
  }
  if(channel==="bark"){
    if(!settings.bark_enabled||!settings.barkKey)throw new Error("Bark 渠道未配置");const base=await publicEndpoint(settings.bark_base_url);const endpoint=await publicEndpoint(`${base}/push`);
    const response=await fetch(endpoint,{method:"POST",redirect:"manual",headers:{"Content-Type":"application/json"},body:JSON.stringify({device_key:settings.barkKey,title:`任务提醒：${payload.task.title}`,body:payload.task.notes||"该推进任务了",group:"GTD Flow",url:payload.url}),signal:AbortSignal.timeout(15_000)});if(!response.ok)throw new Error(`Bark 返回 ${response.status}`);return;
  }
  const {VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,VAPID_SUBJECT}=process.env;if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY||!VAPID_SUBJECT)throw new Error("Web Push VAPID 未配置");webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);
  const subscriptions=(await query<any>("SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=$1 AND enabled",[userId])).rows;if(!subscriptions.length)throw new Error("没有启用的系统通知设备");let sent=0,lastError="";
  for(const sub of subscriptions){try{await publicEndpoint(sub.endpoint);await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:`任务提醒：${payload.task.title}`,body:payload.task.notes||"点击查看任务",url:payload.url,tag:`task-${payload.task.id}`}),{TTL:900,urgency:"high"});sent++;}catch(error:any){lastError=error instanceof Error?error.message:"推送失败";if(error?.statusCode===404||error?.statusCode===410)await query("DELETE FROM push_subscriptions WHERE id=$1",[sub.id]);}}
  if(!sent)throw new Error(lastError||"系统通知发送失败");
}

export async function sendChannelTest(userId:string,channel:NotificationChannel){const now=new Date().toISOString();return sendNotification(userId,channel,{version:1,event:"task.reminder",deliveryId:`test-${Date.now()}`,reminderId:"test",occurredAt:now,task:{id:"test",title:"GTD Flow 测试提醒",notes:"如果你看到这条消息，说明提醒渠道配置正确。"},url:appUrl()});}

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
