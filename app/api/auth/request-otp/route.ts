import { createHash, randomInt, randomUUID } from "node:crypto";
import { query } from "../../../../db/binding";
import { sendOtpEmail } from "../../_lib/mail";

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();
const codeHash = (email: string, code: string) => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return createHash("sha256").update(`${email}:${code}:${secret}`).digest("hex");
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = normalizeEmail(body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return Response.json({ error: "请输入有效邮箱" }, { status: 400 });
    }
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ipKey = `ip:${createHash("sha256").update(forwarded).digest("hex")}`;
    const rate = await query<{ count: number }>(
      `INSERT INTO auth_rate_limits (key,window_start,count) VALUES ($1,NOW(),1)
       ON CONFLICT(key) DO UPDATE SET
         count=CASE WHEN auth_rate_limits.window_start < NOW() - INTERVAL '10 minutes' THEN 1 ELSE auth_rate_limits.count + 1 END,
         window_start=CASE WHEN auth_rate_limits.window_start < NOW() - INTERVAL '10 minutes' THEN NOW() ELSE auth_rate_limits.window_start END
       RETURNING count`,
      [ipKey],
    );
    if ((rate.rows[0]?.count || 0) > 20)
      return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    const recent = await query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM email_otps WHERE email = $1 AND created_at > NOW() - INTERVAL '10 minutes'",
      [email],
    );
    if (Number(recent.rows[0]?.count || 0) >= 3) {
      return Response.json({ error: "验证码发送过于频繁，请稍后再试" }, { status: 429 });
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await query(
      `INSERT INTO email_otps (id,email,code_hash,attempts,expires_at,created_at)
       VALUES ($1,$2,$3,0,NOW() + INTERVAL '10 minutes',NOW())`,
      [randomUUID(), email, codeHash(email, code)],
    );
    await sendOtpEmail(email, code);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("OTP request failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "验证码发送失败，请检查邮件服务配置" }, { status: 500 });
  }
}
