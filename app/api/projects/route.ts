import { authError, requireUser } from "../_lib/auth";
import { createProject, getState } from "../_lib/gtd";
export async function GET(request:Request){try{const user=await requireUser(request);const state=await getState(user.id);return Response.json({items:state.projects,dataVersion:state.dataVersion});}catch(error){return authError(error);}}
export async function POST(request:Request){try{const user=await requireUser(request);return Response.json(await createProject(user.id,await request.json()),{status:201});}catch(error){return authError(error);}}
