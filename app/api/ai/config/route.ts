import { DB } from "../../../../db/binding";
import { authError, requireUser } from "../../_lib/auth";
import { encryptSecret, validateBaseUrl } from "../../_lib/crypto";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const row = await DB.prepare("SELECT base_url AS baseUrl, model, encrypted_key AS encryptedKey FROM ai_configs WHERE user_id = ?").bind(user.id).first<{baseUrl:string;model:string;encryptedKey:string}>();
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
    const existing = await DB.prepare("SELECT encrypted_key AS encryptedKey FROM ai_configs WHERE user_id = ?").bind(user.id).first<{encryptedKey:string}>();
    const encryptedKey = body.apiKey?.trim() ? await encryptSecret(body.apiKey.trim()) : existing?.encryptedKey;
    if (!encryptedKey) return Response.json({ error: "API Key 不能为空" }, { status: 400 });
    await DB.prepare("INSERT INTO ai_configs (user_id,base_url,model,encrypted_key,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET base_url=excluded.base_url,model=excluded.model,encrypted_key=excluded.encrypted_key,updated_at=excluded.updated_at").bind(user.id, baseUrl, model, encryptedKey, Date.now()).run();
    return Response.json({ baseUrl, model, hasKey: true, keyMask: "••••••••" });
  } catch (error) { return authError(error); }
}

export async function DELETE(request: Request) {
  try { const user = await requireUser(request); await DB.prepare("DELETE FROM ai_configs WHERE user_id = ?").bind(user.id).run(); return Response.json({ ok: true }); }
  catch (error) { return authError(error); }
}
