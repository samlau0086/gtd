import { authError, requireUser } from "../../_lib/auth";
import { getDataVersion } from "../../_lib/gtd";
export async function GET(request:Request){try{const user=await requireUser(request);return Response.json({dataVersion:await getDataVersion(user.id)},{headers:{"Cache-Control":"no-store"}});}catch(error){return authError(error);}}
