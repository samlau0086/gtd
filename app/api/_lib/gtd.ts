import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, withTransaction } from "../../../db/binding";

export const TASK_STATUSES = ["inbox", "next", "waiting", "scheduled", "someday", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type ProjectRecord = { id:string; name:string; color:string; revision:number; updatedAt:string };
export type TagRecord = { id:string; name:string; revision:number; updatedAt:string };
export type TaskRecord = {
  id:string; projectId?:string; parentTaskId?:string; title:string; notes:string; status:TaskStatus;
  context:string; important:boolean; startDate?:string; dueDate?:string; estimate:number; sortOrder:number;
  tagIds:string[]; dependencyIds:string[]; revision:number; updatedAt:string;
  reminder?: { id:string; remindAt:string; timezone:string; channels:("email"|"webhook"|"bark"|"push")[]; status:string };
};
export type TaskPatch = Partial<Omit<TaskRecord,"id"|"revision"|"updatedAt">>;

export class GtdError extends Error {
  constructor(message:string, public status=400, public details?:unknown) { super(message); }
}

const validDate = (value?:string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const assertDateRange = (startDate?:string,dueDate?:string) => {
  if(startDate && !validDate(startDate)) throw new GtdError("开始日期格式无效");
  if(dueDate && !validDate(dueDate)) throw new GtdError("截止日期格式无效");
  if(startDate && dueDate && startDate>dueDate) throw new GtdError("开始日期不能晚于截止日期");
};
const status = (value:unknown):TaskStatus => TASK_STATUSES.includes(value as TaskStatus) ? value as TaskStatus : "next";
const normalizeTask = (row:any):TaskRecord => ({
  id:row.id, projectId:row.projectId || undefined, parentTaskId:row.parentTaskId || undefined,
  title:row.title, notes:row.notes || "", status:status(row.status), context:row.context || "", important:Boolean(row.important),
  startDate:row.startDate || undefined, dueDate:row.dueDate || undefined, estimate:Number(row.estimate) || 1,
  sortOrder:Number(row.sortOrder) || 0, tagIds:row.tagIds || [], dependencyIds:row.dependencyIds || [],
  revision:Number(row.revision) || 1, updatedAt:new Date(row.updatedAt).toISOString(),
  reminder:row.reminder ? {...row.reminder,remindAt:new Date(row.reminder.remindAt).toISOString()} : undefined,
});

const taskSelect = `SELECT t.id,t.project_id AS "projectId",t.parent_task_id AS "parentTaskId",t.title,t.notes,t.status,t.context,t.important,
 t.start_date AS "startDate",t.due_date AS "dueDate",t.estimate,t.sort_order AS "sortOrder",t.revision,t.updated_at AS "updatedAt",
 COALESCE((SELECT ARRAY_AGG(tt.tag_id ORDER BY tt.tag_id) FROM task_tags tt WHERE tt.task_id=t.id),ARRAY[]::TEXT[]) AS "tagIds",
 COALESCE((SELECT ARRAY_AGG(td.depends_on_task_id ORDER BY td.depends_on_task_id) FROM task_dependencies td WHERE td.task_id=t.id),ARRAY[]::TEXT[]) AS "dependencyIds",
 (SELECT json_build_object('id',r.id,'remindAt',r.remind_at,'timezone',r.timezone,'channels',r.channels,'status',r.status) FROM task_reminders r WHERE r.task_id=t.id) AS reminder
 FROM tasks t`;

export async function getDataVersion(userId:string, client?:PoolClient) {
  if(client) await client.query(`INSERT INTO user_data_versions(user_id,version) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING`, [userId]);
  else await query(`INSERT INTO user_data_versions(user_id,version) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING`, [userId]);
  const result = client ? await client.query<{version:string}>("SELECT version::text FROM user_data_versions WHERE user_id=$1", [userId]) : await query<{version:string}>("SELECT version::text FROM user_data_versions WHERE user_id=$1", [userId]);
  return Number(result.rows[0]?.version || 0);
}

export async function bumpDataVersion(client:PoolClient, userId:string) {
  const result = await client.query<{version:string}>(`INSERT INTO user_data_versions(user_id,version,updated_at) VALUES($1,1,NOW())
    ON CONFLICT(user_id) DO UPDATE SET version=user_data_versions.version+1,updated_at=NOW() RETURNING version::text`, [userId]);
  return Number(result.rows[0].version);
}

export async function getState(userId:string) {
  const [projects,tasks,tags,version] = await Promise.all([
    query<any>(`SELECT id,name,color,revision,updated_at AS "updatedAt" FROM projects WHERE user_id=$1 ORDER BY created_at`,[userId]),
    query<any>(`${taskSelect} WHERE t.user_id=$1 ORDER BY t.sort_order,t.created_at`,[userId]),
    query<any>(`SELECT id,name,revision,updated_at AS "updatedAt" FROM tags WHERE user_id=$1 ORDER BY name`,[userId]),
    getDataVersion(userId),
  ]);
  return { projects:projects.rows.map((x) => ({...x,revision:Number(x.revision),updatedAt:new Date(x.updatedAt).toISOString()})), tasks:tasks.rows.map(normalizeTask), tags:tags.rows.map((x) => ({...x,revision:Number(x.revision),updatedAt:new Date(x.updatedAt).toISOString()})), dataVersion:version };
}

export async function getTask(userId:string,id:string,client?:PoolClient) {
  const result = client ? await client.query<any>(`${taskSelect} WHERE t.user_id=$1 AND t.id=$2`,[userId,id]) : await query<any>(`${taskSelect} WHERE t.user_id=$1 AND t.id=$2`,[userId,id]);
  return result.rows[0] ? normalizeTask(result.rows[0]) : null;
}

export async function listTasks(userId:string, filters:{query?:string;view?:string;projectId?:string;status?:TaskStatus;tagId?:string;context?:string;important?:boolean;parentTaskId?:string;dueFrom?:string;dueTo?:string;cursor?:string;limit?:number}={}) {
  const values:unknown[]=[userId]; const where=["t.user_id=$1"];
  const add=(sql:string,value:unknown)=>{values.push(value);where.push(sql.replace("?",`$${values.length}`));};
  if(filters.query) { const term=`%${filters.query.slice(0,120)}%`; values.push(term); where.push(`(t.title ILIKE $${values.length} OR t.notes ILIKE $${values.length} OR t.context ILIKE $${values.length})`); }
  if(filters.projectId) add("t.project_id=?",filters.projectId);
  if(filters.status) add("t.status=?",filters.status);
  if(filters.context) add("t.context=?",filters.context);
  if(filters.parentTaskId) add("t.parent_task_id=?",filters.parentTaskId);
  if(filters.important !== undefined) add("t.important=?",filters.important);
  if(filters.tagId) add("EXISTS(SELECT 1 FROM task_tags tx WHERE tx.task_id=t.id AND tx.tag_id=?)",filters.tagId);
  if(filters.dueFrom) add("t.due_date>=?",validDate(filters.dueFrom));
  if(filters.dueTo) add("t.due_date<=?",validDate(filters.dueTo));
  const now = new Date().toISOString().slice(0,10);
  if(filters.view === "today") { values.push(now); where.push(`t.status<>'done' AND (t.start_date=$${values.length} OR t.due_date=$${values.length})`); }
  else if(filters.view === "completed") where.push("t.status='done'");
  else if(filters.view && ["inbox","next","waiting","scheduled","someday"].includes(filters.view)) add("t.status=?",filters.view);
  if(filters.cursor) { const [order,id]=Buffer.from(filters.cursor,"base64url").toString().split(":"); values.push(Number(order),id); where.push(`(t.sort_order,t.id)>($${values.length-1},$${values.length})`); }
  const limit=Math.max(1,Math.min(100,filters.limit || 50)); values.push(limit+1);
  const result=await query<any>(`${taskSelect} WHERE ${where.join(" AND ")} ORDER BY t.sort_order,t.id LIMIT $${values.length}`,values);
  const rows=result.rows.map(normalizeTask); const hasMore=rows.length>limit; const items=rows.slice(0,limit); const last=items[items.length-1];
  return {items,nextCursor:hasMore&&last?Buffer.from(`${last.sortOrder}:${last.id}`).toString("base64url"):null,dataVersion:await getDataVersion(userId)};
}

async function assertOwned(client:PoolClient, table:"projects"|"tags"|"tasks", userId:string, ids:string[]) {
  if(!ids.length) return;
  const result=await client.query<{id:string}>(`SELECT id FROM ${table} WHERE user_id=$1 AND id=ANY($2::text[])`,[userId,[...new Set(ids)]]);
  if(result.rowCount !== new Set(ids).size) throw new GtdError("引用的项目、标签或任务不存在",400);
}

async function assertNoDependencyCycle(client:PoolClient,userId:string,taskId:string,dependencies:string[]) {
  const result=await client.query<{task_id:string;depends_on_task_id:string}>("SELECT task_id,depends_on_task_id FROM task_dependencies WHERE user_id=$1 AND task_id<>$2",[userId,taskId]);
  const graph=new Map<string,string[]>();
  for(const row of result.rows) graph.set(row.task_id,[...(graph.get(row.task_id)||[]),row.depends_on_task_id]);
  graph.set(taskId,dependencies);
  const visiting=new Set<string>(),visited=new Set<string>();
  const visit=(id:string):boolean=>{if(visiting.has(id))return true;if(visited.has(id))return false;visiting.add(id);for(const dep of graph.get(id)||[])if(visit(dep))return true;visiting.delete(id);visited.add(id);return false;};
  if([...graph.keys()].some(visit)) throw new GtdError("任务依赖不能形成循环",400);
}

async function assertNoParentCycle(client:PoolClient,userId:string,taskId:string,parentTaskId?:string) {
  if(!parentTaskId) return;
  const result=await client.query<{id:string}>(`WITH RECURSIVE descendants AS (
    SELECT id FROM tasks WHERE parent_task_id=$1 AND user_id=$2
    UNION ALL SELECT t.id FROM tasks t JOIN descendants d ON t.parent_task_id=d.id WHERE t.user_id=$2
  ) SELECT id FROM descendants WHERE id=$3 LIMIT 1`,[taskId,userId,parentTaskId]);
  if(result.rowCount) throw new GtdError("父子任务不能形成循环");
}

export async function createTask(userId:string,input:TaskPatch & {title:string;id?:string}) {
  return withTransaction(async(client)=>{
    const id=input.id||randomUUID(), tagIds=[...new Set(input.tagIds||[])], deps=[...new Set(input.dependencyIds||[])];
    if(!input.title?.trim()) throw new GtdError("任务标题不能为空",400);
    assertDateRange(input.startDate,input.dueDate);
    if(input.projectId) await assertOwned(client,"projects",userId,[input.projectId]);
    if(input.parentTaskId) await assertOwned(client,"tasks",userId,[input.parentTaskId]);
    await assertOwned(client,"tags",userId,tagIds); await assertOwned(client,"tasks",userId,deps);
    const order=input.sortOrder ?? Number((await client.query<{next:number}>("SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM tasks WHERE user_id=$1",[userId])).rows[0].next);
    await client.query(`INSERT INTO tasks(id,user_id,project_id,parent_task_id,title,notes,status,context,important,start_date,due_date,estimate,sort_order,revision,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,1,NOW(),NOW())`,[id,userId,input.projectId||null,input.parentTaskId||null,input.title.trim().slice(0,240),(input.notes||"").slice(0,10000),status(input.status),String(input.context||"").slice(0,80),Boolean(input.important),validDate(input.startDate),validDate(input.dueDate),Math.max(1,Math.min(365,Number(input.estimate)||1)),order]);
    for(const tagId of tagIds) await client.query("INSERT INTO task_tags(task_id,tag_id) VALUES($1,$2)",[id,tagId]);
    for(const dep of deps) await client.query("INSERT INTO task_dependencies(task_id,depends_on_task_id,user_id) VALUES($1,$2,$3)",[id,dep,userId]);
    const dataVersion=await bumpDataVersion(client,userId); return {record:(await getTask(userId,id,client))!,dataVersion};
  });
}

export async function updateTask(userId:string,id:string,expectedRevision:number,patch:TaskPatch) {
  return withTransaction(async(client)=>{
    const current=await getTask(userId,id,client); if(!current) throw new GtdError("任务不存在",404);
    if(current.revision!==expectedRevision) throw new GtdError("任务已在其他客户端更新",409,{current});
    const next={...current,...patch};
    if(!next.title.trim()) throw new GtdError("任务标题不能为空",400);
    assertDateRange(next.startDate,next.dueDate);
    if(next.projectId) await assertOwned(client,"projects",userId,[next.projectId]);
    if(next.parentTaskId) { if(next.parentTaskId===id) throw new GtdError("任务不能成为自己的父任务"); await assertOwned(client,"tasks",userId,[next.parentTaskId]); await assertNoParentCycle(client,userId,id,next.parentTaskId); }
    const tags=[...new Set(next.tagIds||[])],deps=[...new Set(next.dependencyIds||[])].filter((x)=>x!==id);
    await assertOwned(client,"tags",userId,tags); await assertOwned(client,"tasks",userId,deps); await assertNoDependencyCycle(client,userId,id,deps);
    const updated=await client.query(`UPDATE tasks SET project_id=$1,parent_task_id=$2,title=$3,notes=$4,status=$5,context=$6,important=$7,start_date=$8,due_date=$9,estimate=$10,sort_order=$11,revision=revision+1,updated_at=NOW()
      WHERE id=$12 AND user_id=$13 AND revision=$14 RETURNING id`,[next.projectId||null,next.parentTaskId||null,next.title.trim().slice(0,240),next.notes.slice(0,10000),status(next.status),next.context.slice(0,80),Boolean(next.important),validDate(next.startDate),validDate(next.dueDate),Math.max(1,Math.min(365,next.estimate)),next.sortOrder,id,userId,expectedRevision]);
    if(!updated.rowCount) throw new GtdError("任务已在其他客户端更新",409,{current:await getTask(userId,id,client)});
    if(patch.tagIds){await client.query("DELETE FROM task_tags WHERE task_id=$1",[id]);for(const tagId of tags)await client.query("INSERT INTO task_tags(task_id,tag_id) VALUES($1,$2)",[id,tagId]);}
    if(patch.dependencyIds){await client.query("DELETE FROM task_dependencies WHERE task_id=$1 AND user_id=$2",[id,userId]);for(const dep of deps)await client.query("INSERT INTO task_dependencies(task_id,depends_on_task_id,user_id) VALUES($1,$2,$3)",[id,dep,userId]);}
    if(next.status==="done"&&current.status!=="done") await client.query("UPDATE task_reminders SET status='cancelled',updated_at=NOW() WHERE task_id=$1 AND user_id=$2 AND status IN ('pending','processing')",[id,userId]);
    const dataVersion=await bumpDataVersion(client,userId);return{record:(await getTask(userId,id,client))!,dataVersion};
  });
}

export async function reorderTasks(userId:string,orderedTaskIds:string[],expectedDataVersion:number) {
  return withTransaction(async(client)=>{
    const currentVersion=await getDataVersion(userId,client);
    if(currentVersion!==expectedDataVersion) throw new GtdError("任务顺序已在其他客户端更新",409,{dataVersion:currentVersion});
    await assertOwned(client,"tasks",userId,orderedTaskIds);
    for(const [index,id] of orderedTaskIds.entries()) await client.query("UPDATE tasks SET sort_order=$1,revision=revision+1,updated_at=NOW() WHERE id=$2 AND user_id=$3",[index,id,userId]);
    const dataVersion=await bumpDataVersion(client,userId); return {dataVersion};
  });
}

export async function createProject(userId:string,input:{name:string;color?:string;id?:string}) { return withTransaction(async(client)=>{const id=input.id||randomUUID();if(!input.name?.trim())throw new GtdError("项目名称不能为空");await client.query("INSERT INTO projects(id,user_id,name,color,revision,created_at,updated_at) VALUES($1,$2,$3,$4,1,NOW(),NOW())",[id,userId,input.name.trim().slice(0,80),input.color||"#69d2c8"]);const dataVersion=await bumpDataVersion(client,userId);const record=(await client.query<any>('SELECT id,name,color,revision,updated_at AS "updatedAt" FROM projects WHERE id=$1',[id])).rows[0];return{record:{...record,updatedAt:new Date(record.updatedAt).toISOString()},dataVersion};}); }
export async function updateProject(userId:string,id:string,expectedRevision:number,input:{name?:string;color?:string}) { return withTransaction(async(client)=>{const result=await client.query<any>(`UPDATE projects SET name=COALESCE($1,name),color=COALESCE($2,color),revision=revision+1,updated_at=NOW() WHERE id=$3 AND user_id=$4 AND revision=$5 RETURNING id,name,color,revision,updated_at AS "updatedAt"`,[input.name?.trim().slice(0,80)||null,input.color||null,id,userId,expectedRevision]);if(!result.rowCount){const current=(await client.query<any>('SELECT id,name,color,revision,updated_at AS "updatedAt" FROM projects WHERE id=$1 AND user_id=$2',[id,userId])).rows[0];throw new GtdError(current?"项目已在其他客户端更新":"项目不存在",current?409:404,{current});}const dataVersion=await bumpDataVersion(client,userId);return{record:{...result.rows[0],updatedAt:new Date(result.rows[0].updatedAt).toISOString()},dataVersion};}); }
export async function createTag(userId:string,input:{name:string;id?:string}) { return withTransaction(async(client)=>{const id=input.id||randomUUID();if(!input.name?.trim())throw new GtdError("标签名称不能为空");await client.query("INSERT INTO tags(id,user_id,name,revision,updated_at) VALUES($1,$2,$3,1,NOW())",[id,userId,input.name.trim().slice(0,40)]);const dataVersion=await bumpDataVersion(client,userId);const record=(await client.query<any>('SELECT id,name,revision,updated_at AS "updatedAt" FROM tags WHERE id=$1',[id])).rows[0];return{record:{...record,updatedAt:new Date(record.updatedAt).toISOString()},dataVersion};}); }
export async function updateTag(userId:string,id:string,expectedRevision:number,input:{name:string}) { return withTransaction(async(client)=>{const result=await client.query<any>(`UPDATE tags SET name=$1,revision=revision+1,updated_at=NOW() WHERE id=$2 AND user_id=$3 AND revision=$4 RETURNING id,name,revision,updated_at AS "updatedAt"`,[input.name.trim().slice(0,40),id,userId,expectedRevision]);if(!result.rowCount){const current=(await client.query<any>('SELECT id,name,revision,updated_at AS "updatedAt" FROM tags WHERE id=$1 AND user_id=$2',[id,userId])).rows[0];throw new GtdError(current?"标签已在其他客户端更新":"标签不存在",current?409:404,{current});}const dataVersion=await bumpDataVersion(client,userId);return{record:{...result.rows[0],updatedAt:new Date(result.rows[0].updatedAt).toISOString()},dataVersion};}); }

function decodeCursor(cursor?:string){if(!cursor)return null;try{return Buffer.from(cursor,"base64url").toString();}catch{return null;}}
export async function listProjects(userId:string,options:{cursor?:string;limit?:number}={}) {const limit=Math.max(1,Math.min(100,options.limit||50)),cursor=decodeCursor(options.cursor),values:unknown[]=[userId];let clause="";if(cursor){values.push(cursor);clause=`AND id>$${values.length}`;}values.push(limit+1);const rows=(await query<any>(`SELECT id,name,color,revision,updated_at AS "updatedAt" FROM projects WHERE user_id=$1 ${clause} ORDER BY id LIMIT $${values.length}`,values)).rows;const items=rows.slice(0,limit).map((x)=>({...x,revision:Number(x.revision),updatedAt:new Date(x.updatedAt).toISOString()}));return{items,nextCursor:rows.length>limit?Buffer.from(items.at(-1)!.id).toString("base64url"):null,dataVersion:await getDataVersion(userId)};}
export async function listTags(userId:string,options:{cursor?:string;limit?:number}={}) {const limit=Math.max(1,Math.min(100,options.limit||50)),cursor=decodeCursor(options.cursor),values:unknown[]=[userId];let clause="";if(cursor){values.push(cursor);clause=`AND id>$${values.length}`;}values.push(limit+1);const rows=(await query<any>(`SELECT id,name,revision,updated_at AS "updatedAt" FROM tags WHERE user_id=$1 ${clause} ORDER BY id LIMIT $${values.length}`,values)).rows;const items=rows.slice(0,limit).map((x)=>({...x,revision:Number(x.revision),updatedAt:new Date(x.updatedAt).toISOString()}));return{items,nextCursor:rows.length>limit?Buffer.from(items.at(-1)!.id).toString("base64url"):null,dataVersion:await getDataVersion(userId)};}

export async function deleteResource(userId:string,type:"task"|"project"|"tag",id:string,expectedRevision:number) { return withTransaction(async(client)=>{const table=type==="task"?"tasks":type==="project"?"projects":"tags";const current=await client.query<any>(`SELECT id,revision FROM ${table} WHERE id=$1 AND user_id=$2 FOR UPDATE`,[id,userId]);if(!current.rowCount)throw new GtdError("资源不存在",404);if(Number(current.rows[0].revision)!==expectedRevision)throw new GtdError("资源已发生变化，请重新确认",409);let impact:any={};if(type==="task"){const descendants=await client.query<{count:string}>(`WITH RECURSIVE tree AS (SELECT id FROM tasks WHERE id=$1 AND user_id=$2 UNION ALL SELECT t.id FROM tasks t JOIN tree x ON t.parent_task_id=x.id WHERE t.user_id=$2) SELECT COUNT(*)::text AS count FROM tree`,[id,userId]);impact={deletedTasks:Number(descendants.rows[0].count)};}else if(type==="project"){const count=await client.query<{count:string}>("SELECT COUNT(*)::text AS count FROM tasks WHERE project_id=$1 AND user_id=$2",[id,userId]);impact={tasksMovedToNoProject:Number(count.rows[0].count)};}else{const count=await client.query<{count:string}>("SELECT COUNT(*)::text AS count FROM task_tags tt JOIN tasks t ON t.id=tt.task_id WHERE tt.tag_id=$1 AND t.user_id=$2",[id,userId]);impact={taskLinksRemoved:Number(count.rows[0].count)};}await client.query(`DELETE FROM ${table} WHERE id=$1 AND user_id=$2`,[id,userId]);const dataVersion=await bumpDataVersion(client,userId);return{impact,dataVersion};}); }

export async function getDeleteImpact(userId:string,type:"task"|"project"|"tag",id:string) {const table=type==="task"?"tasks":type==="project"?"projects":"tags";const row=(await query<any>(`SELECT id,revision,${type==="task"?"title": "name"} AS name FROM ${table} WHERE id=$1 AND user_id=$2`,[id,userId])).rows[0];if(!row)throw new GtdError("资源不存在",404);let impact:any={};if(type==="task"){const c=await query<{count:string}>(`WITH RECURSIVE tree AS (SELECT id FROM tasks WHERE id=$1 AND user_id=$2 UNION ALL SELECT t.id FROM tasks t JOIN tree x ON t.parent_task_id=x.id WHERE t.user_id=$2) SELECT COUNT(*)::text AS count FROM tree`,[id,userId]);impact={deletedTasks:Number(c.rows[0].count)};}else if(type==="project"){const c=await query<{count:string}>("SELECT COUNT(*)::text AS count FROM tasks WHERE project_id=$1 AND user_id=$2",[id,userId]);impact={tasksMovedToNoProject:Number(c.rows[0].count)};}else{const c=await query<{count:string}>("SELECT COUNT(*)::text AS count FROM task_tags tt JOIN tasks t ON t.id=tt.task_id WHERE tt.tag_id=$1 AND t.user_id=$2",[id,userId]);impact={taskLinksRemoved:Number(c.rows[0].count)};}return{id,name:row.name,revision:Number(row.revision),impact};}
