import { query } from "../../../../db/binding";
import { requireAdmin, authError } from "../../_lib/auth";
import { assertPublicEndpoint, encryptSecret, validateBaseUrl } from "../../_lib/crypto";

type Provider = "smtp" | "resend";
type Row = { provider:Provider; host:string; port:number; username:string; mail_from:string; secure:boolean; encrypted_password:string; api_base_url:string };

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const result = await query<Row>("SELECT provider,host,port,username,mail_from,secure,encrypted_password,api_base_url FROM smtp_configs WHERE id=1");
    const row = result.rows[0];
    return Response.json(row ? { provider:row.provider, host:row.host, port:row.port, username:row.username, mailFrom:row.mail_from, secure:row.secure, apiBaseUrl:row.api_base_url, hasSecret:Boolean(row.encrypted_password) } : null);
  } catch (error) { return authError(error); }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin(request);
    const body = (await request.json()) as { provider?:Provider; host?:string; port?:number; username?:string; secret?:string; mailFrom?:string; secure?:boolean; apiBaseUrl?:string };
    const provider: Provider = body.provider === "resend" ? "resend" : "smtp";
    const host = String(body.host || "").trim();
    const port = Number(body.port || 587);
    const username = String(body.username || "").trim();
    const mailFrom = String(body.mailFrom || "").trim();
    let apiBaseUrl = String(body.apiBaseUrl || "https://api.resend.com").trim();
    if (!mailFrom.includes("@")) return Response.json({ error:"请填写有效的发件人地址" }, { status:400 });
    if (provider === "smtp" && (!host || !Number.isInteger(port) || port < 1 || port > 65535))
      return Response.json({ error:"请填写有效的 SMTP 主机和端口" }, { status:400 });
    if (provider === "resend") {
      try { apiBaseUrl = validateBaseUrl(apiBaseUrl); await assertPublicEndpoint(apiBaseUrl); }
      catch (error) { return Response.json({ error:error instanceof Error ? error.message : "API 地址无效" }, { status:400 }); }
    }
    const existing = await query<{ provider:Provider; encrypted_password:string }>("SELECT provider,encrypted_password FROM smtp_configs WHERE id=1");
    const canReuse = existing.rows[0]?.provider === provider;
    const encrypted = body.secret ? await encryptSecret(body.secret) : canReuse ? existing.rows[0]?.encrypted_password : undefined;
    if (!encrypted) return Response.json({ error:provider === "resend" ? "首次配置必须填写 Resend API Key" : "首次配置必须填写 SMTP 密码" }, { status:400 });
    await query(
      `INSERT INTO smtp_configs(id,provider,host,port,username,encrypted_password,mail_from,secure,api_base_url,updated_at)
       VALUES(1,$1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT(id) DO UPDATE SET
       provider=EXCLUDED.provider,host=EXCLUDED.host,port=EXCLUDED.port,username=EXCLUDED.username,
       encrypted_password=EXCLUDED.encrypted_password,mail_from=EXCLUDED.mail_from,secure=EXCLUDED.secure,
       api_base_url=EXCLUDED.api_base_url,updated_at=NOW()`,
      [provider,host,port,username,encrypted,mailFrom,Boolean(body.secure),apiBaseUrl],
    );
    return Response.json({ provider,host,port,username,mailFrom,secure:Boolean(body.secure),apiBaseUrl,hasSecret:true });
  } catch (error) { return authError(error); }
}
