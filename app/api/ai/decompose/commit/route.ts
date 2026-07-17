import { authError, requireUser } from "../../../_lib/auth";
import { commitTaskDecomposition } from "../../../_lib/ai-tasks";
export async function POST(request:Request){try{const user=await requireUser(request),body=await request.json() as any;return Response.json(await commitTaskDecomposition(user.id,String(body.parentTaskId||""),body.items),{status:201});}catch(error){return authError(error);}}
