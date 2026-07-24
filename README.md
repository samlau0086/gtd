# GTD Flow — VPS + PostgreSQL

## Windows 桌面客户端

桌面客户端复用已部署的 GTD Flow 服务，提供 Windows 原生任务栏数字、系统托盘常驻和开机自动启动。点击关闭会把窗口最小化到任务栏，以便 Windows 保留带数字的任务栏按钮；需要完全结束时，从托盘菜单选择“退出”。

开发运行：

```powershell
npm run desktop:dev
```

首次启动时输入 GTD Flow 服务地址，例如 `https://gtd.example.com`，然后在桌面窗口内正常登录。也可以通过 `GTD_FLOW_DESKTOP_URL` 环境变量预设地址。

生成 Windows 安装程序：

```powershell
npm run desktop:dist
```

安装程序输出到 `release/GTD-Flow-Setup-*.exe`，会创建桌面与开始菜单快捷方式。安装后客户端默认启用开机后台启动，可在托盘菜单关闭。任务栏数字只统计“截止日期为今天且尚未完成”的任务；超过 99 项时图标显示 `99`，托盘菜单仍显示真实数量。

发布新版本时，同时更新根目录与 `desktop/package.json` 的版本并推送对应标签：

```powershell
git tag v0.1.1
git push origin v0.1.1
```

`Release Windows Desktop` 工作流会在 Windows runner 上运行完整测试、构建安装程序、生成 `SHA256SUMS.txt`，并自动创建 GitHub Release。工作流也可针对已经存在的标签手动重跑；它不会创建标签，且标签版本与两个 `package.json` 不一致时会拒绝发布。

## 任务提醒

任务可设置一个 Todo 风格的提醒时间，并同时发送到 Email、签名 Webhook、Bark 和已授权的 PWA 系统通知。提醒由独立 `reminder-worker` 容器处理，即使浏览器没有打开也会发送。

启用 PWA 系统通知前运行 `npx web-push generate-vapid-keys`，然后配置 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` 和 `VAPID_SUBJECT`。iPhone 需要 iOS 16.4 或更高版本，并先把网站添加到主屏幕。

自托管的中文 GTD Web App，包含任务管理、可拖拽甘特图、邮箱验证码登录和用户自带密钥的 AI 任务拆分。

## 架构

- Next.js 16 / Node.js 22
- PostgreSQL 16 + pgvector
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

## GitHub Actions 自动部署

推送到 `main` 分支或手动运行 `Deploy to VPS` 工作流时，Actions 会：

1. 构建生产镜像并推送到当前仓库的 GHCR。
2. 通过 SSH 上传 `docker-compose.prod.yml`、`Caddyfile` 和运行环境文件。
3. VPS 同时运行 `pgvector/pgvector:pg16`，拉取指定提交对应的应用镜像，自动启用 `vector` 扩展并执行迁移。
4. 检查公网 `/api/health`；失败时尝试恢复上一镜像。

建议在仓库 `Settings → Environments` 创建 `production` 环境，并在该环境中配置以下内容。生产环境可额外启用审批和分支保护。

### Secrets

| 名称 | 内容 |
| --- | --- |
| `VPS_SSH_PRIVATE_KEY` | 专用部署用户的 SSH 私钥完整内容 |
| `VPS_HOST_KEY` | 可信渠道取得的 VPS SSH host key，例如 `ssh-keyscan -p 22 your-vps.example.com` 的完整输出 |
| `POSTGRES_PASSWORD` | PostgreSQL 强随机密码，推荐 `openssl rand -hex 32` |
| `AUTH_SECRET` | 登录验证码签名密钥，至少 32 字符，推荐 `openssl rand -base64 48` |
| `AI_ENCRYPTION_KEY` | AI 密钥加密主密钥，必须为 `openssl rand -base64 32` 的结果 |
| `SMTP_PASS` | SMTP 密码或应用专用密码 |

运行时 Secrets 请使用推荐命令生成的十六进制/Base64 值，不要包含换行、反斜杠或单引号。

### Variables

| 名称 | 示例 | 说明 |
| --- | --- | --- |
| `VPS_HOST` | `vps.example.com` | VPS 主机名或 IPv4 地址 |
| `VPS_PORT` | `22` | SSH 端口，可省略 |
| `VPS_USER` | `deploy` | 可运行 Docker 的非 root 部署用户 |
| `DEPLOY_PATH` | `/opt/gtd-flow` | 部署目录，可省略 |
| `DOMAIN` | `gtd.example.com` | 已解析到 VPS 的站点域名 |
| `POSTGRES_DB` | `gtdflow` | 数据库名，可省略 |
| `POSTGRES_USER` | `gtdflow` | 数据库用户，可省略 |
| `DB_POOL_SIZE` | `10` | 应用连接池大小，可省略 |
| `SMTP_HOST` | `smtp.example.com` | SMTP 服务器 |
| `SMTP_PORT` | `587` | SMTP 端口，可省略 |
| `SMTP_USER` | `mailer@example.com` | SMTP 用户名 |
| `MAIL_FROM` | `GTD Flow <mailer@example.com>` | 发件人 |
| `DOCKER_PLATFORM` | `linux/amd64` | VPS 为 ARM 时改成 `linux/arm64` |

VPS 首次准备只需要安装 Docker Engine 与 Compose 插件，将部署用户加入 `docker` 组，并确保其能写入 `DEPLOY_PATH`。80/443 端口必须能从公网访问。工作流使用仓库自带的 `GITHUB_TOKEN` 发布和拉取 GHCR 镜像，无需额外配置 Registry Token。

PostgreSQL 数据保存在固定卷 `gtd-flow-postgres` 中，应用发布不会删除或重建该卷。若 VPS 上已经存在 PostgreSQL 17 数据卷，不能直接挂载到 PostgreSQL 16；需要先用 `pg_dump` 导出，再在 PG16/pgvector 数据库中恢复。

Actions 依赖由 Dependabot 每周检查更新。

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
