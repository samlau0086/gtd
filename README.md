# GTD Flow

中文个人效率 Web App：GTD 任务管理、可拖拽甘特排期、邮箱验证码登录和 AI 自动细分任务。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

未配置环境变量时，首页会进入带示例数据的本机演示模式；配置 Supabase 后自动启用真实登录和 D1 云同步。

## 环境变量

复制 `.env.example` 为 `.env.local`，填写：

- `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase publishable/anon key
- `AI_ENCRYPTION_KEY`：32 字节随机值的 Base64，用于 AES-GCM 加密用户模型密钥

Supabase 的邮件模板需要包含 `{{ .Token }}`，以便发送 6 位验证码。

## 数据与发布

- `.openai/hosting.json` 声明 Sites D1 绑定 `DB`。
- `db/schema.ts` 定义业务表，`drizzle/` 保存部署迁移。
- 用户 API Key 仅在服务端加密保存，客户端读取时只返回掩码。
- `npm run db:generate` 在数据库结构改变后生成迁移。

## 验证

```bash
npm test
npx tsc --noEmit
```
