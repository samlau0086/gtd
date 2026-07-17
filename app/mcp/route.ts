import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { GtdError } from "../api/_lib/gtd";
import { requireMcpPrincipal } from "../api/_lib/mcp-auth";
import { buildMcpServer } from "../api/_lib/mcp-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

async function handle(request:Request){
  try{
    const url=new URL(request.url);const expected=(process.env.DOMAIN||url.hostname).toLowerCase();const host=(request.headers.get("host")||"").split(":")[0].toLowerCase();
    if(host!==expected && !(process.env.NODE_ENV!=="production" && ["localhost","127.0.0.1"].includes(host))) return Response.json({error:"Invalid host"},{status:403});
    const origin=request.headers.get("origin");if(origin){const allowed=`https://${expected}`;if(origin!==allowed && !(process.env.NODE_ENV!=="production"&&origin.startsWith("http://localhost")))return Response.json({error:"Invalid origin"},{status:403});}
    const principal=await requireMcpPrincipal(request);const server=buildMcpServer(principal);const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);return await transport.handleRequest(request,{authInfo:{token:"redacted",clientId:principal.tokenId,scopes:principal.scope==="write"?["read","write"]:["read"]}});
  }catch(error){const status=error instanceof GtdError?error.status:500;return Response.json({jsonrpc:"2.0",error:{code:status===401?-32001:-32603,message:error instanceof Error?error.message:"MCP 服务暂不可用"},id:null},{status,headers:status===401?{"WWW-Authenticate":'Bearer realm="gtd-flow-mcp"'}:undefined});}
}
export const POST=handle;
export const GET=handle;
export const DELETE=handle;
