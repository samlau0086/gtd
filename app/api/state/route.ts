import { query, withTransaction } from "../../../db/binding";
import { authError, requireUser } from "../_lib/auth";

type ProjectInput = { id: string; name: string; color: string };
type TagInput = { id: string; name: string };
type TaskInput = { id: string; projectId?: string; parentTaskId?: string; title: string; notes?: string; status: string; context?: string; important?: boolean; startDate?: string; dueDate?: string; estimate?: number; sortOrder?: number; tagIds?: string[]; dependencyIds?: string[] };
const safeDate = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const [projects, tasks, tags, taskTags, dependencies] = await Promise.all([
      query<ProjectInput>("SELECT id,name,color FROM projects WHERE user_id=$1 ORDER BY created_at", [user.id]),
      query<TaskInput>(`SELECT id,project_id AS "projectId",parent_task_id AS "parentTaskId",title,notes,status,context,important,start_date AS "startDate",due_date AS "dueDate",estimate,sort_order AS "sortOrder" FROM tasks WHERE user_id=$1 ORDER BY sort_order,created_at`, [user.id]),
      query<TagInput>("SELECT id,name FROM tags WHERE user_id=$1 ORDER BY name", [user.id]),
      query<{taskId:string;tagId:string}>(`SELECT tt.task_id AS "taskId",tt.tag_id AS "tagId" FROM task_tags tt JOIN tasks t ON t.id=tt.task_id WHERE t.user_id=$1`, [user.id]),
      query<{taskId:string;dependsOnTaskId:string}>(`SELECT task_id AS "taskId",depends_on_task_id AS "dependsOnTaskId" FROM task_dependencies WHERE user_id=$1`, [user.id]),
    ]);
    const taskRows = tasks.rows.map((task) => ({ ...task, important: Boolean(task.important), tagIds: taskTags.rows.filter((x) => x.taskId === task.id).map((x) => x.tagId), dependencyIds: dependencies.rows.filter((x) => x.taskId === task.id).map((x) => x.dependsOnTaskId) }));
    return Response.json({ projects: projects.rows, tasks: taskRows, tags: tags.rows, user });
  } catch (error) { return authError(error); }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as { projects?: ProjectInput[]; tasks?: TaskInput[]; tags?: TagInput[] };
    const projects = Array.isArray(body.projects) ? body.projects.slice(0, 100) : [];
    const tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 1000) : [];
    const tags = Array.isArray(body.tags) ? body.tags.slice(0, 200) : [];
    if (tasks.some((task) => !task.id || !task.title?.trim())) return Response.json({ error: "任务标题不能为空" }, { status: 400 });
    const known = new Set(tasks.map((task) => task.id));
    const graph = new Map(tasks.map((task) => [task.id, (task.dependencyIds ?? []).filter((id) => known.has(id))]));
    const visiting = new Set<string>(); const visited = new Set<string>();
    const cycle = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); for (const dep of graph.get(id) ?? []) if (cycle(dep)) return true; visiting.delete(id); visited.add(id); return false; };
    if ([...known].some(cycle)) return Response.json({ error: "任务依赖不能形成循环" }, { status: 400 });
    await withTransaction(async (client) => {
      await client.query("DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE user_id=$1)", [user.id]);
      await client.query("DELETE FROM task_dependencies WHERE user_id=$1", [user.id]);
      await client.query("DELETE FROM tasks WHERE user_id=$1", [user.id]);
      await client.query("DELETE FROM projects WHERE user_id=$1", [user.id]);
      await client.query("DELETE FROM tags WHERE user_id=$1", [user.id]);
      for (const project of projects) await client.query("INSERT INTO projects (id,user_id,name,color,created_at) VALUES ($1,$2,$3,$4,NOW())", [project.id,user.id,project.name.slice(0,80),project.color || "#69d2c8"]);
      for (const tag of tags) await client.query("INSERT INTO tags (id,user_id,name) VALUES ($1,$2,$3)", [tag.id,user.id,tag.name.slice(0,40)]);
      for (const [index, task] of tasks.entries()) await client.query(`INSERT INTO tasks (id,user_id,project_id,parent_task_id,title,notes,status,context,important,start_date,due_date,estimate,sort_order,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())`, [task.id,user.id,task.projectId || null,task.parentTaskId || null,task.title.trim().slice(0,240),(task.notes || "").slice(0,10000),task.status || "next",(task.context || "").slice(0,80),Boolean(task.important),safeDate(task.startDate),safeDate(task.dueDate),Math.max(1,Math.min(365,task.estimate || 1)),task.sortOrder ?? index]);
      for (const task of tasks) for (const tagId of (task.tagIds ?? []).filter((id) => tags.some((tag) => tag.id === id))) await client.query("INSERT INTO task_tags (task_id,tag_id) VALUES ($1,$2)", [task.id,tagId]);
      for (const task of tasks) for (const dependencyId of (task.dependencyIds ?? []).filter((id) => known.has(id) && id !== task.id)) await client.query("INSERT INTO task_dependencies (task_id,depends_on_task_id,user_id) VALUES ($1,$2,$3)", [task.id,dependencyId,user.id]);
    });
    return Response.json({ ok: true, updatedAt: Date.now() });
  } catch (error) { return authError(error); }
}
