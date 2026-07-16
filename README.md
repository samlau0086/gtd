# GTD Flow — VPS + PostgreSQL

自托管的中文 GTD Web App，包含任务管理、可拖拽甘特图、邮箱验证码登录和用户自带密钥的 AI 任务拆分。

## 架构

- Next.js 16 / Node.js 22
- PostgreSQL 17
- 应用内邮箱验证码认证（SMTP）
- AES-GCM 加密保存每位用户的 AI API Key
- Caddy 自动申请与续期 HTTPS 证书
- Docker Compose 编排应用、数据库和反向代理

## VPS 部署

服务器建议：Ubuntu 24.04、2 GB 内存、已安装 Docker Engine 与 Docker Compose 插件。

1. 将代码放到 VPS，并将域名 A/AAAA 记录指向服务器。
2. 复制环境变量模板：`cp .env.example .env`。
3. 填写域名、数据库密码、认证密钥、AI 加密密钥和 SMTP 参数。
4. 开放 TCP 80/443 和 UDP 443。
5. 启动：`docker compose up -d --build`。
6. 检查：`docker compose ps`，然后访问 `https://你的域名/api/health`。

推荐生成数据库密码：`openssl rand -hex 32`。不要将 `.env` 提交到版本库。

应用容器启动时会自动按顺序执行 `postgres/migrations/*.sql`，已执行记录保存在 `schema_migrations`。不要删除生产数据卷。

## 本地开发

准备 PostgreSQL 并设置 `DATABASE_URL`、`AUTH_SECRET` 和 SMTP 环境变量，然后：

```bash
npm ci
npm run dev
```

生产构建：`npm run build`。

## 备份

```bash
docker compose exec -T db pg_dump -U gtdflow gtdflow | gzip > gtd-flow-$(date +%F).sql.gz
```

恢复前请先停止应用写入，并在独立环境验证备份文件。
