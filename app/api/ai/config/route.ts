import { query } from "../../../../db/binding";
import { authError, requireUser } from "../../_lib/auth";
import { encryptSecret, validateBaseUrl } from "../../_lib/crypto";

type ConfigRow = { baseUrl: string; model: string; encryptedKey: string };

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const result = await query<ConfigRow>(`SELECT base_url AS "baseUrl",model,encrypted_key AS "encryptedKey" FROM ai_configs WHERE user_id=$1`, [user.id]);
    const row = result.rows[0];
    return Response.json(row ? { baseUrl: row.baseUrl, model: row.model, hasKey: Boolean(row.encryptedKey), keyMask: "••••••••" } : null);
  } catch (error) { return authError(error); }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as { baseUrl?: string; model?: string; apiKey?: string };
    const baseUrl = validateBaseUrl(body.baseUrl || "");
    const model = (body.model || "").trim().slice(0,120);
    if (!model) return Response.json({ error: "模型名称不能为空" }, { status: 400 });
    const existing = await query<{encryptedKey:string}>(`SELECT encrypted_key AS "encryptedKey" FROM ai_configs WHERE user_id=$1`, [user.id]);
    const encryptedKey = body.apiKey?.trim() ? await encryptSecret(body.apiKey.trim()) : existing.rows[0]?.encryptedKey;
    if (!encryptedKey) return Response.json({ error: "API Key 不能为空" }, { status: 400 });
    await query(`INSERT INTO ai_configs (user_id,base_url,model,encrypted_key,updated_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT(user_id) DO UPDATE SET base_url=EXCLUDED.base_url,model=EXCLUDED.model,encrypted_key=EXCLUDED.encrypted_key,updated_at=EXCLUDED.updated_at`, [user.id,baseUrl,model,encryptedKey]);
    return Response.json({ baseUrl, model, hasKey: true, keyMask: "••••••••" });
  } catch (error) { return authError(error); }
}

export async function DELETE(request: Request) {
  try { const user = await requireUser(request); await query("DELETE FROM ai_configs WHERE user_id=$1", [user.id]); return Response.json({ ok: true }); }
  catch (error) { return authError(error); }
}
