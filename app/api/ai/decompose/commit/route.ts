import { DB } from "../../../../../db/binding";
import { authError, requireUser } from "../../../_lib/auth";

type DraftItem = { tempId: string; title: string; notes?: string; estimate?: number; startDate?: string; dueDate?: string; dependsOn?: string[] };
const validDate = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as { parentTaskId?: string; items?: DraftItem[] };
    const parent = body.parentTaskId ? await DB.prepare("SELECT id, project_id AS projectId, context FROM tasks WHERE id = ? AND user_id = ?").bind(body.parentTaskId, user.id).first<{id:string;projectId?:string;context:string}>() : null;
    if (!parent) return Response.json({ error: "父任务不存在" }, { status: 404 });
    const items = Array.isArray(body.items) ? body.items.slice(0, 12) : [];
    if (!items.length || items.some((item) => !item.tempId || !item.title?.trim())) return Response.json({ error: "拆分草稿无效" }, { status: 400 });
    const idMap = new Map(items.map((item) => [item.tempId, crypto.randomUUID()]));
    const previous = new Set<string>();
    for (const item of items) { if ((item.dependsOn ?? []).some((id) => !previous.has(id))) return Response.json({ error: "依赖只能指向前面的步骤" }, { status: 400 }); previous.add(item.tempId); }
    const now = Date.now();
    const statements = items.flatMap((item, index) => {
      const id = idMap.get(item.tempId)!;
      return [
        DB.prepare("INSERT INTO tasks (id,user_id,project_id,parent_task_id,title,notes,status,context,important,start_date,due_date,estimate,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, user.id, parent.projectId || null, parent.id, item.title.trim().slice(0,240), (item.notes || "").slice(0,2000), "next", parent.context || "", 0, validDate(item.startDate), validDate(item.dueDate), Math.max(1, Math.min(90, Number(item.estimate) || 1)), now + index, now, now),
        ...(item.dependsOn ?? []).map((dependency) => DB.prepare("INSERT INTO task_dependencies (task_id,depends_on_task_id,user_id) VALUES (?,?,?)").bind(id, idMap.get(dependency), user.id)),
      ];
    });
    await DB.batch(statements);
    return Response.json({ tasks: items.map((item) => ({ ...item, id: idMap.get(item.tempId) })) }, { status: 201 });
  } catch (error) { return authError(error); }
}
