import { createHash } from "node:crypto";
import { query } from "../../../db/binding";
import { GtdError } from "./gtd";

export type AuthUser = { id: string; email: string };

export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function requireUser(request: Request): Promise<AuthUser> {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Response("Unauthorized", { status: 401 });
  const result = await query<AuthUser>(
    `SELECT u.id, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [hashToken(token)],
  );
  const user = result.rows[0];
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return user;
}

export async function requireAdmin(request: Request): Promise<AuthUser> {
  const user = await requireUser(request);
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!adminEmail || user.email.toLowerCase() !== adminEmail)
    throw new Response("Forbidden", { status: 403 });
  return user;
}

export function authError(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof GtdError) return Response.json({ error:error.message, details:error.details }, { status:error.status });
  console.error("API request failed", error instanceof Error ? error.message : "unknown");
  return Response.json({ error: "服务器暂时无法处理请求" }, { status: 500 });
}
