import { authError, requireUser } from "../_lib/auth";
import { createMcpToken, listMcpTokens } from "../_lib/mcp-auth";

const noStore={"Cache-Control":"no-store"};
export async function GET(request:Request) { try { const user=await requireUser(request); return Response.json({tokens:await listMcpTokens(user.id),endpoint:`https://${process.env.DOMAIN || new URL(request.url).host}/mcp`},{headers:noStore}); } catch(error){return authError(error);} }
export async function POST(request:Request) { try { const user=await requireUser(request); const body=await request.json() as {name?:string;scope?:string;expiresInDays?:number|null};const scope=body.scope==="read"?"read":"write";const expiry=body.expiresInDays===null?null:[30,90,365].includes(Number(body.expiresInDays))?Number(body.expiresInDays):90;return Response.json(await createMcpToken(user.id,{name:String(body.name||"MCP Token"),scope,expiresInDays:expiry}),{status:201,headers:noStore}); } catch(error){return authError(error);} }
