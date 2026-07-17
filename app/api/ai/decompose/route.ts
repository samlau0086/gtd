import { authError, requireUser } from "../../_lib/auth";
import { decomposeTaskWithAi } from "../../_lib/ai-tasks";
export async function POST(request:Request){try{const user=await requireUser(request);return Response.json(await decomposeTaskWithAi(user.id,await request.json()));}catch(error){return authError(error);}}
