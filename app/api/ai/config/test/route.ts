import { DB } from "../../../../../db/binding";
import { authError, requireUser } from "../../../_lib/auth";
import { decryptSecret, validateBaseUrl } from "../../../_lib/crypto";

type ConfigRow = {
  baseUrl: string;
  model: string;
  encryptedKey: string;
};

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as {
      baseUrl?: string;
      model?: string;
      apiKey?: string;
    };
    const existing = await DB.prepare(
      "SELECT base_url AS baseUrl, model, encrypted_key AS encryptedKey FROM ai_configs WHERE user_id = ?",
    )
      .bind(user.id)
      .first<ConfigRow>();
    const baseUrl = validateBaseUrl(body.baseUrl || existing?.baseUrl || "");
    const model = (body.model || existing?.model || "").trim().slice(0, 120);
    if (!model)
      return Response.json({ error: "模型名称不能为空" }, { status: 400 });
    const apiKey = body.apiKey?.trim()
      ? body.apiKey.trim()
      : existing?.encryptedKey
        ? await decryptSecret(existing.encryptedKey)
        : "";
    if (!apiKey)
      return Response.json({ error: "请先输入 API Key" }, { status: 400 });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 2,
          messages: [{ role: "user", content: "Reply OK" }],
        }),
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      return Response.json(
        { error: `模型连接失败（HTTP ${response.status}）` },
        { status: 502 },
      );
    }
    return Response.json({ ok: true, latencyMs: Date.now() - startedAt });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return Response.json({ error: "连接超时，请检查服务地址" }, { status: 504 });
    }
    return authError(error);
  }
}
