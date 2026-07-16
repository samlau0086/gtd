import { DB } from "../../../../db/binding";
import { authError, requireUser } from "../../_lib/auth";
import { decryptSecret, validateBaseUrl } from "../../_lib/crypto";

type DraftItem = { tempId: string; title: string; notes: string; estimate: number; startDate?: string; dueDate?: string; dependsOn: string[] };

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as { title?: string; notes?: string; dueDate?: string; instruction?: string };
    if (!body.title?.trim()) return Response.json({ error: "任务标题不能为空" }, { status: 400 });
    const config = await DB.prepare("SELECT base_url AS baseUrl, model, encrypted_key AS encryptedKey FROM ai_configs WHERE user_id = ?").bind(user.id).first<{baseUrl:string;model:string;encryptedKey:string}>();
    if (!config) return Response.json({ error: "请先配置 AI 模型" }, { status: 409 });
    const baseUrl = validateBaseUrl(config.baseUrl);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    const prompt = `你是 GTD 任务规划助手。请把任务拆成 3-8 个可执行步骤，并只输出 JSON：{\"items\":[{\"tempId\":\"s1\",\"title\":\"...\",\"notes\":\"...\",\"estimate\":1,\"startDate\":\"YYYY-MM-DD\",\"dueDate\":\"YYYY-MM-DD\",\"dependsOn\":[\"s0\"]}]}。estimate 是整数天；依赖只能引用前面的 tempId。任务：${body.title}\n备注：${body.notes || "无"}\n目标日期：${body.dueDate || "未指定"}\n补充要求：${body.instruction || "无"}`;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await decryptSecret(config.encryptedKey)}` },
        body: JSON.stringify({ model: config.model, temperature: 0.2, messages: [{ role: "system", content: "输出严格 JSON，不要 Markdown。" }, { role: "user", content: prompt }] }),
      });
    } finally { clearTimeout(timer); }
    if (!response.ok) return Response.json({ error: `模型调用失败（${response.status}）` }, { status: 502 });
    const raw = await response.json() as { choices?: Array<{message?:{content?:string}}> };
    const text = raw.choices?.[0]?.message?.content?.replace(/^```json\s*|\s*```$/g, "");
    if (!text) return Response.json({ error: "模型没有返回可用内容" }, { status: 502 });
    const parsed = JSON.parse(text) as { items?: DraftItem[] };
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 12).map((item, index) => ({
      tempId: String(item.tempId || `s${index + 1}`), title: String(item.title || "").trim().slice(0,240), notes: String(item.notes || "").slice(0,2000), estimate: Math.max(1, Math.min(90, Number(item.estimate) || 1)),
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(item.startDate || "") ? item.startDate : undefined,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate || "") ? item.dueDate : undefined,
      dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn.map(String) : [],
    })).filter((item) => item.title) : [];
    if (!items.length) return Response.json({ error: "模型返回了空的任务列表" }, { status: 502 });
    const previous = new Set<string>(); for (const item of items) { item.dependsOn = item.dependsOn.filter((id) => previous.has(id)); previous.add(item.tempId); }
    return Response.json({ items });
  } catch (error) { return authError(error); }
}
