import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { query, withTransaction } from "../../../../db/binding";

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();
const codeHash = (email: string, code: string) => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return createHash("sha256").update(`${email}:${code}:${secret}`).digest("hex");
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; code?: string };
    const email = normalizeEmail(body.email);
    const code = String(body.code || "");
    if (!/^\d{6}$/.test(code))
      return Response.json({ error: "请输入 6 位验证码" }, { status: 400 });
    const otpResult = await query<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM email_otps
       WHERE email = $1 AND consumed_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email],
    );
    const otp = otpResult.rows[0];
    if (!otp || otp.attempts >= 5)
      return Response.json({ error: "验证码无效或已过期" }, { status: 400 });
    const expected = Buffer.from(otp.code_hash, "hex");
    const actual = Buffer.from(codeHash(email, code), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      await query("UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1", [otp.id]);
      return Response.json({ error: "验证码无效或已过期" }, { status: 400 });
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const user = await withTransaction(async (client) => {
      await client.query("UPDATE email_otps SET consumed_at = NOW() WHERE id = $1", [otp.id]);
      const userId = randomUUID();
      const userResult = await client.query<{ id: string; email: string }>(
        `INSERT INTO users (id,email,created_at) VALUES ($1,$2,NOW())
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id,email`,
        [userId, email],
      );
      const current = userResult.rows[0];
      await client.query(
        `INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at)
         VALUES ($1,$2,$3,NOW() + INTERVAL '30 days',NOW())`,
        [randomUUID(), current.id, tokenHash],
      );
      return current;
    });
    return Response.json({ accessToken: token, user });
  } catch (error) {
    console.error("OTP verification failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "登录服务暂时不可用" }, { status: 500 });
  }
}
