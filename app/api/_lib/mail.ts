import nodemailer from "nodemailer";
import { query } from "../../../db/binding";
import { decryptSecret } from "./crypto";

export type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  mailFrom: string;
  secure: boolean;
};

type StoredSmtpConfig = {
  host: string;
  port: number;
  username: string;
  encrypted_password: string;
  mail_from: string;
  secure: boolean;
};

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const result = await query<StoredSmtpConfig>(
    "SELECT host,port,username,encrypted_password,mail_from,secure FROM smtp_configs WHERE id=1",
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    host: row.host,
    port: row.port,
    username: row.username,
    password: await decryptSecret(row.encrypted_password),
    mailFrom: row.mail_from,
    secure: row.secure,
  };
}

export async function sendMail(config: SmtpConfig, to: string, subject: string, text: string, html?: string) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username ? { user: config.username, pass: config.password } : undefined,
  });
  await transport.sendMail({ from: config.mailFrom, to, subject, text, html });
}

export async function sendOtpEmail(email: string, code: string) {
  const config = await getSmtpConfig();
  if (!config) throw new Error("请先由管理员在网页后台配置邮件服务");
  await sendMail(
    config,
    email,
    `${code} 是你的 GTD Flow 验证码`,
    `你的 GTD Flow 验证码是 ${code}，10 分钟内有效。若非本人操作，请忽略此邮件。`,
    `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;background:#151a1b;color:#eef4f3;border-radius:16px"><div style="color:#69d2c8;font-size:12px;letter-spacing:2px;font-weight:700">GTD FLOW</div><h1 style="font-size:24px">验证你的邮箱</h1><p style="color:#aab4b3">输入以下 6 位验证码继续登录：</p><div style="margin:28px 0;font-size:36px;letter-spacing:10px;font-weight:800;color:#69d2c8">${code}</div><p style="color:#7f8b8a;font-size:12px">验证码 10 分钟内有效。若非本人操作，请忽略此邮件。</p></div>`,
  );
}
