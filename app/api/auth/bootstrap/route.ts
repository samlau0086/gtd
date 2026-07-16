import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { query, withTransaction } from "../../../../db/binding";
import { hashToken } from "../../_lib/auth";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

export async function POST(request: Request) {
  try {
    const configured = await query("SELECT 1 FROM smtp_configs WHERE id=1");
    if (configured.rowCount) return Response.json({ error: "初始化入口已关闭" }, { status: 409 });
    const body = (await request.json()) as { email?: string; token?: string };
    const email = normalize(body.email);
    const expectedEmail = normalize(process.env.ADMIN_EMAIL);
    const supplied = createHash("sha256").update(String(body.token || "")).digest();
    const expected = createHash("sha256").update(process.env.BOOTSTRAP_TOKEN || "").digest();
    if (!expectedEmail || email !== expectedEmail || !process.env.BOOTSTRAP_TOKEN || !timingSafeEqual(supplied, expected))
      return Response.json({ error: "管理员邮箱或初始化令牌不正确" }, { status: 403 });
    const accessToken = randomBytes(32).toString("base64url");
    const user = await withTransaction(async (client) => {
      const result = await client.query<{ id: string; email: string }>(
        `INSERT INTO users (id,email,created_at) VALUES ($1,$2,NOW())
         ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id,email`,
        [randomUUID(), email],
      );
      await client.query(
        `INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at)
         VALUES ($1,$2,$3,NOW() + INTERVAL '2 hours',NOW())`,
        [randomUUID(), result.rows[0].id, hashToken(accessToken)],
      );
      return result.rows[0];
    });
    return Response.json({ accessToken, user, bootstrap: true });
  } catch (error) {
    console.error("Bootstrap login failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "初始化登录暂时不可用" }, { status: 500 });
  }
}
