# 科研成长日志（Scientific Growth Log）

> 一个面向科研学习者的多人 Web 日志工具，用结构化日记持续记录每日进展、问题与下一步计划。

## 📖 项目背景与目标

科研工作往往周期长、反馈慢，日常进展容易散落在聊天记录、临时文档或纸质笔记中。科研成长日志希望用一个足够简单的固定结构，帮助用户每天回答三个问题：

- 今天完成了什么？
- 遇到了什么问题？
- 下一步准备做什么？

项目从单用户 Diary MVP 演进为多人版本，目前已具备用户认证、数据隔离、用户时区和基础个人工作台，并完成 PostgreSQL 与自动化部署流程的工程适配。产品仍保持轻量，不包含统计分析、AI 总结、项目管理或多人协作功能。

## ✨ 核心功能

- **用户认证**：基于 Better Auth 的邮箱密码注册、登录、退出和 Session 持久化。
- **今日科研日志**：记录完成事项、遇到问题和下一步计划；同一用户同一天重复保存时更新原记录。
- **用户数据隔离**：Diary 归属于当前 Session 用户，不接受客户端指定 `userId`；其他用户的日志详情返回 404。
- **历史与详情**：按日期倒序查看自己的历史日志，并进入单篇详情。
- **关键词搜索**：在当前用户的完成事项、问题和下一步计划中进行包含搜索。
- **用户时区**：按照用户设置的 IANA 时区判断“今天”，默认 `Asia/Shanghai`。
- **个人设置**：修改用户名和时区，邮箱只读。
- **个人 Dashboard**：展示今日记录状态、最近 3 篇日志和常用入口。
- **健康检查**：`GET /api/health` 使用轻量查询检查 PostgreSQL 连接状态。

## 🧰 技术栈

| 类别 | 技术 |
| --- | --- |
| Web 框架 | Next.js 16（App Router） |
| UI | React 19、TypeScript、Tailwind CSS 4 |
| ORM | Prisma 6 |
| 数据库 | PostgreSQL |
| 认证 | Better Auth + Prisma Adapter |
| 测试 | Node.js Test Runner |
| 代码质量 | ESLint |
| CI / Migration | GitHub Actions |
| 本地数据库 | Docker Compose + PostgreSQL 17 Alpine |

## 🏗️ 系统架构

```text
Browser
  │
  ▼
Next.js App Router
  ├─ Pages / Server Components
  ├─ Route Handlers (/api/auth, /api/diary, /api/settings, /api/health)
  └─ Better Auth Session
        │
        ├─ current-user：从服务端 Session 获取用户身份
        │
        └─ diary-service：统一处理 Diary 查询与写入
              │
              ▼
        Prisma Client
              │
              ▼
         PostgreSQL
```

Diary 页面、API、Dashboard、历史和搜索都通过服务端 Session 获得 `user.id`。Diary 数据访问集中在 `diary-service`，所有查询都带用户条件；客户端传入的用户 ID 不参与权限判断。

数据库中 `User` 与 `Diary` 是一对多关系，`@@unique([userId, date])` 保证同一用户每天最多一篇日志，同时允许不同用户在同一天分别记录。

更完整的设计说明见 [系统架构](docs/architecture.md) 与 [数据库设计](docs/database.md)。

## 📁 项目结构

```text
.
├─ .github/workflows/       # CI 与 staging migration workflow
├─ docs/                    # 架构、数据库、开发与部署文档
├─ prisma/
│  ├─ schema.prisma         # PostgreSQL 数据模型
│  ├─ migrations/           # 当前 PostgreSQL migration 历史
│  └─ migrations-sqlite-legacy/ # 归档的 SQLite migration
├─ scripts/                 # 部署检查与数据迁移演练脚本
├─ src/
│  ├─ app/                  # 页面与 Route Handlers
│  ├─ components/           # 导航、认证和设置组件
│  ├─ features/diary/       # Diary 服务、类型和格式化逻辑
│  └─ lib/                  # Prisma、Better Auth、当前用户和时区工具
├─ tests/                   # 认证、Diary、时区、健康检查和迁移测试
├─ docker-compose.yml       # 本地 PostgreSQL 17 开发环境
└─ package.json             # 开发、测试、构建和 migration 命令
```

## 🚀 本地开发

### 前置条件

- Node.js `24.19.0`（以 `.nvmrc` 为准）
- pnpm `10.34.6`（以 `package.json#packageManager` 为准）
- Docker Desktop 或其他支持 Docker Compose 的容器环境

### 1. 安装依赖

```bash
pnpm install
```

安装完成后，`postinstall` 会自动执行 `prisma generate`。

### 2. 配置环境变量

复制完整开发模板：

```powershell
Copy-Item .env.example .env
```

如果使用仓库提供的 Docker Compose，请将 `.env` 中数据库端口改为 `5433`。也可以参考 `.env.local.example` 中已经配置好的本地 PostgreSQL URL。

### 3. 启动 PostgreSQL

```bash
docker compose up -d
docker compose ps
```

本地服务名为 `scientific-log-postgres`，使用 `postgres:17-alpine`，监听 `localhost:5433`。请等待状态变为 `healthy`。

### 4. 应用数据库 migration

```bash
pnpm db:migrate:deploy
```

### 5. 启动应用

```bash
pnpm dev
```

默认访问地址为 <http://localhost:3000>。停止本地数据库可执行：

```bash
docker compose down
```

详细说明见 [本地开发环境](docs/development.md)。

## 🔐 环境变量

| 变量 | 是否必需 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | 应用运行时 PostgreSQL 连接；云端建议使用连接池地址 |
| `DIRECT_URL` | 是 | Prisma migration 与管理操作使用的直连地址 |
| `BETTER_AUTH_SECRET` | 是 | Better Auth 签名密钥，生产环境应使用至少 32 个高熵字符 |
| `BETTER_AUTH_URL` | 是 | 应用的完整 Origin；本地通常为 `http://localhost:3000` |
| `TEST_DATABASE_URL` | 测试时 | 集成测试使用的 PostgreSQL 直连地址；测试会创建并清理隔离 Schema |

仓库提供：

- `.env.example`：完整本地开发变量示例。
- `.env.local.example`：Docker PostgreSQL 数据库连接示例。
- `.env.production.example`：生产环境变量结构示例。

不要提交 `.env`、真实数据库凭据或 Better Auth 密钥。开发、staging 和 production 应使用不同的数据库与密钥。

## 🗄️ 数据库迁移

当前有效的 migration 位于 `prisma/migrations/`，仅适用于 PostgreSQL。旧的 SQLite migration 已原样归档至 `prisma/migrations-sqlite-legacy/`，不能在 PostgreSQL 上执行。

本地修改 Prisma Schema 并创建 migration：

```bash
pnpm db:migrate:dev
```

应用仓库中已经提交的 migration：

```bash
pnpm db:migrate:deploy
```

staging / production 只能执行 `migrate deploy`，不应运行 `migrate dev`。仓库还提供 SQLite → PostgreSQL 演练脚本，用于导出 `User`、`Account`、`Diary`，保留 ID 并校验数量、关联、日期、正文和时区；该流程当前仅完成本地演练，尚未迁移生产数据。

## ✅ 测试与质量检查

```bash
# ESLint
pnpm lint

# 全部部署级测试（串行执行）
pnpm test:deploy

# 生产构建
pnpm build
```

也可以运行单项测试：

```bash
pnpm test:auth
pnpm test:diary
pnpm test:timezone
pnpm test:health
pnpm test:migration
pnpm test:deployment
```

集成测试需要可创建和删除 Schema 的 PostgreSQL 直连地址，可通过 `TEST_DATABASE_URL`、`DIRECT_URL` 或 `DATABASE_URL` 提供。

GitHub Actions 会在每次 `push` 和 `pull_request` 时使用 Node.js 24.x、pnpm 10.34.6 和临时 PostgreSQL，依次执行依赖安装、Prisma Client 生成、lint、`test:deploy` 和 build。

## ☁️ 部署架构

目标 staging / production 架构为：

```text
GitHub
  ├─ CI：lint + tests + build
  └─ 手动 Migration Workflow
        │  使用 DIRECT_URL
        ▼
Managed PostgreSQL
        ▲
        │  应用运行使用 DATABASE_URL
Vercel / Next.js Node.js Runtime
  ├─ Better Auth
  ├─ Prisma Client
  └─ GET /api/health
```

推荐发布顺序：CI 通过 → 人工执行 `prisma migrate deploy` → 部署同一 commit → 检查 `/api/health` → 完成认证、Session、用户隔离、Diary、搜索和时区冒烟测试。

当前仓库已经准备好 CI、手动 staging migration workflow、部署检查脚本和生产环境变量模板，但**尚未创建或连接任何云端资源，也尚未进行 production 部署**。完整流程见 [部署指南](docs/deployment.md)。

## 📌 当前完成情况

- [x] v1.0：单用户 Diary MVP
- [x] 当日日志创建、读取与更新
- [x] 历史列表、日志详情和关键词搜索
- [x] v2.0：Better Auth 多用户认证
- [x] Session 持久化与 Diary 用户隔离
- [x] v2.1：用户时区与个人设置
- [x] 登录后的基础 Dashboard
- [x] PostgreSQL Schema 与 migration 历史适配
- [x] SQLite → PostgreSQL 数据迁移本地演练
- [x] 健康检查、部署检查与 GitHub Actions
- [x] Docker Compose 本地 PostgreSQL 环境
- [ ] 创建 staging 云资源并完成首次部署
- [ ] 迁移 production 数据并完成正式上线

## 🗺️ Roadmap

### v2.2 云端化（进行中）

- [ ] 配置独立的 staging PostgreSQL、应用域名与 Better Auth 密钥
- [ ] 完成 Vercel staging 部署和上线后冒烟测试
- [ ] 建立 production 备份、恢复与发布回滚流程
- [ ] 在维护窗口完成最终数据迁移和 production 切换
- [ ] 补充错误监控与结构化日志

### 长期候选（未实现）

- [ ] 基于用户本人日志的阶段总结
- [ ] 历史进展、阻塞与下一步计划提炼
- [ ] 用户私有 Diary 范围内的语义检索或问答

以上 AI 方向仅为长期候选，需要先明确模型供应商、成本、隐私和数据保留策略。当前产品不提供 AI、统计图表、项目管理或多人协作能力。

## 📚 项目文档

- [系统架构](docs/architecture.md)
- [数据库设计](docs/database.md)
- [开发规划](docs/development-plan.md)
- [本地开发环境](docs/development.md)
- [部署指南](docs/deployment.md)
- [API 说明](docs/api.md)
- [技术决策记录](docs/decisions.md)
