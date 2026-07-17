import { authError, requireUser } from "../../_lib/auth";
import { revokeMcpToken } from "../../_lib/mcp-auth";

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}) { try {const user=await requireUser(request);const{id}=await params;await revokeMcpToken(user.id,id);return Response.json({ok:true});}catch(error){return authError(error);} }
