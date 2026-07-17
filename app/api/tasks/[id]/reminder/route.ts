import { authError, requireUser } from "../../../_lib/auth";
import { deleteTaskReminder, setTaskReminder } from "../../../_lib/notifications";

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser(request),{id}=await params;return Response.json(await setTaskReminder(user.id,id,await request.json()));}catch(error){return authError(error);}}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser(request),{id}=await params;return Response.json(await deleteTaskReminder(user.id,id));}catch(error){return authError(error);}}
