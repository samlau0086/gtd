import { authError, requireUser } from "../../_lib/auth";
import { reorderTasks } from "../../_lib/gtd";
export async function POST(request:Request){try{const user=await requireUser(request),body=await request.json() as any;return Response.json(await reorderTasks(user.id,Array.isArray(body.orderedTaskIds)?body.orderedTaskIds:[],Number(body.expectedDataVersion)));}catch(error){return authError(error);}}
