import { authError, requireUser } from "../../_lib/auth";
import { sendChannelTest } from "../../_lib/notification-delivery";
import { NOTIFICATION_CHANNELS, type NotificationChannel } from "../../_lib/notifications";
export async function POST(request:Request){try{const user=await requireUser(request),body=await request.json(),channel=String(body.channel) as NotificationChannel;if(!NOTIFICATION_CHANNELS.includes(channel))return Response.json({error:"提醒渠道无效"},{status:400});await sendChannelTest(user.id,channel);return Response.json({ok:true});}catch(error){return authError(error);}}
