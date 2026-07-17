import { authError, requireUser } from "../_lib/auth";
import { getNotificationSettings, updateNotificationSettings } from "../_lib/notifications";
export async function GET(request:Request){try{const user=await requireUser(request);return Response.json(await getNotificationSettings(user.id));}catch(error){return authError(error);}}
export async function PUT(request:Request){try{const user=await requireUser(request);return Response.json(await updateNotificationSettings(user.id,await request.json()));}catch(error){return authError(error);}}
