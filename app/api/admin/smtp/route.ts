import { query } from "../../../../db/binding";
import { requireAdmin, authError } from "../../_lib/auth";
import { encryptSecret } from "../../_lib/crypto";

type Row = { host:string; port:number; username:string; mail_from:string; secure:boolean; encrypted_password:string };

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const result = await query<Row>("SELECT host,port,username,mail_from,secure,encrypted_password FROM smtp_configs WHERE id=1");
    const row = result.rows[0];
    return Response.json(row ? { host:row.host, port:row.port, username:row.username, mailFrom:row.mail_from, secure:row.secure, hasPassword:Boolean(row.encrypted_password) } : null);
  } catch (error) { return authError(error); }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin(request);
    const body = (await request.json()) as { host?:string; port?:number; username?:string; password?:string; mailFrom?:string; secure?:boolean };
    const host = String(body.host || "").trim();
    const port = Number(body.port);
    const username = String(body.username || "").trim();
    const mailFrom = String(body.mailFrom || "").trim();
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !mailFrom.includes("@"))
      return Response.json({ error:"请填写有效的 SMTP 主机、端口和发件人" }, { status:400 });
    const existing = await query<{ encrypted_password:string }>("SELECT encrypted_password FROM smtp_configs WHERE id=1");
    const encrypted = body.password ? await encryptSecret(body.password) : existing.rows[0]?.encrypted_password;
    if (!encrypted) return Response.json({ error:"首次配置必须填写 SMTP 密码" }, { status:400 });
    await query(
      `INSERT INTO smtp_configs(id,host,port,username,encrypted_password,mail_from,secure,updated_at)
       VALUES(1,$1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(id) DO UPDATE SET
       host=EXCLUDED.host,port=EXCLUDED.port,username=EXCLUDED.username,encrypted_password=EXCLUDED.encrypted_password,
       mail_from=EXCLUDED.mail_from,secure=EXCLUDED.secure,updated_at=NOW()`,
      [host,port,username,encrypted,mailFrom,Boolean(body.secure)],
    );
    return Response.json({ host,port,username,mailFrom,secure:Boolean(body.secure),hasPassword:true });
  } catch (error) { return authError(error); }
}
