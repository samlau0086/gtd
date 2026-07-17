import { authError, requireUser } from "../../_lib/auth";
import { deleteResource, updateProject } from "../../_lib/gtd";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser(request),{id}=await params,body=await request.json() as any;return Response.json(await updateProject(user.id,id,Number(body.expectedRevision),body.patch||{}));}catch(error){return authError(error);}}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser(request),{id}=await params,body=await request.json() as any;return Response.json(await deleteResource(user.id,"project",id,Number(body.expectedRevision)));}catch(error){return authError(error);}}
