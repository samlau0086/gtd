import { requireAdmin, authError } from "../../../_lib/auth";
import { getSmtpConfig, sendMail } from "../../../_lib/mail";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const config = await getSmtpConfig();
    if (!config) return Response.json({ error:"请先保存 SMTP 配置" }, { status:400 });
    await sendMail(config, admin.email, "GTD Flow 邮件服务测试", "邮件服务配置成功，邮箱验证码登录现在可以正常使用。", "<h2>GTD Flow 邮件服务配置成功</h2><p>邮箱验证码登录现在可以正常使用。</p>");
    return Response.json({ ok:true });
  } catch (error) { return authError(error); }
}
