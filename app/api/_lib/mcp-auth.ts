import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { query, withTransaction } from "../../../db/binding";
import { GtdError } from "./gtd";

export type McpPrincipal = { userId:string; tokenId:string; scope:"read"|"write"; tokenName:string };

function secret() { const value=process.env.AUTH_SECRET; if(!value||value.length<32)throw new Error("AUTH_SECRET is not configured"); return value; }
export const hashMcpToken=(token:string)=>createHmac("sha256",secret()).update(token).digest("hex");

export async function createMcpToken(userId:string,input:{name:string;scope:"read"|"write";expiresInDays:number|null}) {
  const raw=`gtd_mcp_${randomBytes(32).toString("base64url")}`; const id=randomUUID();
  const expiresAt=input.expiresInDays ? new Date(Date.now()+input.expiresInDays*86400000) : null;
  await query(`INSERT INTO mcp_tokens(id,user_id,name,token_hash,scope,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,NOW())`,[id,userId,input.name.trim().slice(0,80)||"MCP Token",hashMcpToken(raw),input.scope,expiresAt]);
  return {id,name:input.name.trim().slice(0,80)||"MCP Token",scope:input.scope,expiresAt:expiresAt?.toISOString()||null,token:raw};
}

export async function listMcpTokens(userId:string) {
  const result=await query<any>(`SELECT id,name,scope,expires_at AS "expiresAt",last_used_at AS "lastUsedAt",revoked_at AS "revokedAt",created_at AS "createdAt" FROM mcp_tokens WHERE user_id=$1 ORDER BY created_at DESC`,[userId]);
  return result.rows.map((row)=>({...row,expiresAt:row.expiresAt?new Date(row.expiresAt).toISOString():null,lastUsedAt:row.lastUsedAt?new Date(row.lastUsedAt).toISOString():null,revokedAt:row.revokedAt?new Date(row.revokedAt).toISOString():null,createdAt:new Date(row.createdAt).toISOString()}));
}

export async function revokeMcpToken(userId:string,id:string) { const result=await query("UPDATE mcp_tokens SET revoked_at=NOW() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL",[id,userId]); if(!result.rowCount)throw new GtdError("Token 不存在或已撤销",404); }

export async function requireMcpPrincipal(request:Request):Promise<McpPrincipal> {
  const header=request.headers.get("authorization")||""; const raw=header.startsWith("Bearer ")?header.slice(7).trim():"";
  if(!raw.startsWith("gtd_mcp_")) throw new GtdError("缺少有效的 MCP Token",401);
  const result=await query<any>(`SELECT id,user_id AS "userId",name,scope FROM mcp_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>NOW()) LIMIT 1`,[hashMcpToken(raw)]);
  const token=result.rows[0]; if(!token)throw new GtdError("MCP Token 无效、已过期或已撤销",401);
  const rate=await query<{count:number}>(`INSERT INTO mcp_rate_limits(token_id,window_start,count) VALUES($1,NOW(),1) ON CONFLICT(token_id) DO UPDATE SET count=CASE WHEN mcp_rate_limits.window_start<NOW()-INTERVAL '1 minute' THEN 1 ELSE mcp_rate_limits.count+1 END,window_start=CASE WHEN mcp_rate_limits.window_start<NOW()-INTERVAL '1 minute' THEN NOW() ELSE mcp_rate_limits.window_start END RETURNING count`,[token.id]);
  if(Number(rate.rows[0].count)>120) throw new GtdError("MCP 请求过于频繁，请稍后再试",429);
  await query("UPDATE mcp_tokens SET last_used_at=NOW() WHERE id=$1",[token.id]);
  return {userId:token.userId,tokenId:token.id,scope:token.scope,tokenName:token.name};
}

export function requireWrite(principal:McpPrincipal) { if(principal.scope!=="write")throw new GtdError("此 Token 仅有只读权限",403); }

export async function auditMcp(principal:McpPrincipal,toolName:string,success:boolean,targetType?:string,targetId?:string,requestId=randomUUID()) {
  await query(`INSERT INTO mcp_audit_logs(id,user_id,token_id,tool_name,target_type,target_id,success,request_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,[randomUUID(),principal.userId,principal.tokenId,toolName,targetType||null,targetId||null,success,requestId]);
}

export async function createDeleteConfirmation(principal:McpPrincipal,type:"task"|"project"|"tag",resourceId:string,revision:number) {
  const raw=randomBytes(32).toString("base64url"),id=randomUUID(),expiresAt=new Date(Date.now()+5*60000);
  await query(`INSERT INTO mcp_delete_confirmations(id,user_id,token_id,resource_type,resource_id,resource_revision,confirmation_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,[id,principal.userId,principal.tokenId,type,resourceId,revision,hashMcpToken(raw),expiresAt]);
  return {confirmationToken:raw,expiresAt:expiresAt.toISOString()};
}

export async function consumeDeleteConfirmation(principal:McpPrincipal,type:"task"|"project"|"tag",resourceId:string,raw:string) {
  return withTransaction(async(client)=>{const result=await client.query<{id:string;resource_revision:number}>(`SELECT id,resource_revision FROM mcp_delete_confirmations WHERE confirmation_hash=$1 AND user_id=$2 AND token_id=$3 AND resource_type=$4 AND resource_id=$5 AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE`,[hashMcpToken(raw),principal.userId,principal.tokenId,type,resourceId]);const row=result.rows[0];if(!row)throw new GtdError("删除确认令牌无效、已过期或已使用",400);await client.query("UPDATE mcp_delete_confirmations SET consumed_at=NOW() WHERE id=$1",[row.id]);return Number(row.resource_revision);});
}
