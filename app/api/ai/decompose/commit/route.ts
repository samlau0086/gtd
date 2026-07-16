import { query, withTransaction } from "../../../../../db/binding";
import { authError, requireUser } from "../../../_lib/auth";

type DraftItem = { tempId: string; title: string; notes?: string; estimate?: number; startDate?: string; dueDate?: string; dependsOn?: string[] };
type ParentRow = { id: string; projectId?: string; context: string; tagIds: string[] };
const validDate = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as { parentTaskId?: string; items?: DraftItem[] };
    const parentResult = body.parentTaskId ? await query<ParentRow>(`SELECT t.id,t.project_id AS "projectId",t.context,COALESCE(ARRAY_AGG(tt.tag_id) FILTER (WHERE tt.tag_id IS NOT NULL),ARRAY[]::TEXT[]) AS "tagIds" FROM tasks t LEFT JOIN task_tags tt ON tt.task_id=t.id WHERE t.id=$1 AND t.user_id=$2 GROUP BY t.id`, [body.parentTaskId,user.id]) : null;
    const parent = parentResult?.rows[0];
    if (!parent) return Response.json({ error: "父任务不存在" }, { status: 404 });
    const items = Array.isArray(body.items) ? body.items.slice(0,12) : [];
    if (!items.length || items.some((item) => !item.tempId || !item.title?.trim())) return Response.json({ error: "拆分草稿无效" }, { status: 400 });
    const idMap = new Map(items.map((item) => [item.tempId,crypto.randomUUID()]));
    const previous = new Set<string>();
    for (const item of items) { if ((item.dependsOn ?? []).some((id) => !previous.has(id))) return Response.json({ error: "依赖只能指向前面的步骤" }, { status: 400 }); previous.add(item.tempId); }
    await withTransaction(async (client) => {
      for (const [index,item] of items.entries()) {
        const id = idMap.get(item.tempId)!;
        await client.query(`INSERT INTO tasks (id,user_id,project_id,parent_task_id,title,notes,status,context,important,start_date,due_date,estimate,sort_order,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,'next',$7,FALSE,$8,$9,$10,$11,NOW(),NOW())`, [id,user.id,parent.projectId || null,parent.id,item.title.trim().slice(0,240),(item.notes || "").slice(0,2000),parent.context || "",validDate(item.startDate),validDate(item.dueDate),Math.max(1,Math.min(90,Number(item.estimate) || 1)),Date.now() + index]);
        for (const tagId of parent.tagIds) await client.query("INSERT INTO task_tags (task_id,tag_id) VALUES ($1,$2)", [id,tagId]);
        for (const dependency of item.dependsOn ?? []) await client.query("INSERT INTO task_dependencies (task_id,depends_on_task_id,user_id) VALUES ($1,$2,$3)", [id,idMap.get(dependency),user.id]);
      }
    });
    return Response.json({ tasks: items.map((item) => ({ ...item,id:idMap.get(item.tempId) })) }, { status: 201 });
  } catch (error) { return authError(error); }
}
