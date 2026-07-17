import { authError, requireUser } from "../../_lib/auth";
import { deleteResource, getTask, updateTask } from "../../_lib/gtd";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser(request),{id}=await params;const record=await getTask(user.id,id);return record?Response.json(record):Response.json({error:"任务不存在"},{status:404});}catch(error){return authError(error);}}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser(request),{id}=await params,body=await request.json() as any;return Response.json(await updateTask(user.id,id,Number(body.expectedRevision),body.patch||{}));}catch(error){return authError(error);}}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser(request),{id}=await params,body=await request.json() as any;return Response.json(await deleteResource(user.id,"task",id,Number(body.expectedRevision)));}catch(error){return authError(error);}}
