import nodemailer from "nodemailer";

export async function sendOtpEmail(email: string, code: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM;
  if (!host || !user || !pass || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[GTD Flow] ${email} verification code: ${code}`);
      return;
    }
    throw new Error("SMTP is not configured");
  }
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transport.sendMail({
    from,
    to: email,
    subject: `${code} 是你的 GTD Flow 验证码`,
    text: `你的 GTD Flow 验证码是 ${code}，10 分钟内有效。若非本人操作，请忽略此邮件。`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;background:#151a1b;color:#eef4f3;border-radius:16px"><div style="color:#69d2c8;font-size:12px;letter-spacing:2px;font-weight:700">GTD FLOW</div><h1 style="font-size:24px">验证你的邮箱</h1><p style="color:#aab4b3">输入以下 6 位验证码继续登录：</p><div style="margin:28px 0;font-size:36px;letter-spacing:10px;font-weight:800;color:#69d2c8">${code}</div><p style="color:#7f8b8a;font-size:12px">验证码 10 分钟内有效。若非本人操作，请忽略此邮件。</p></div>`,
  });
}
