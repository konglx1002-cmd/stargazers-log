# 科研成长日志（Scientific Growth Log）

> 一个面向科研学习者的多人 Web 日志工具，用结构化日记持续记录每日进展、问题与下一步计划。

## 📖 项目背景与目标

科研工作往往周期长、反馈慢，日常进展容易散落在聊天记录、临时文档或纸质笔记中。科研成长日志希望用一个足够简单的固定结构，帮助用户每天回答三个问题：

- 今天完成了什么？
- 遇到了什么问题？
- 下一步准备做什么？

正式应用已部署在 Render，数据库为 Neon PostgreSQL，并存在真实用户数据。v2.4.0 已于 2026-10-23 上线，Render Live 与 GitHub main 均为 `6ff6ef57a64e62cca53bb23ba4f0917840dbffb9`，Auto-Deploy 保持关闭。

v2.4 已提供科研项目、项目独立日志和 Dashboard 项目区域；生产增量 Migration 已成功执行，旧 Diary 数据完整性校验通过，线上功能验收 8/8 通过。

## ✨ 核心功能

- **用户认证**：基于 Better Auth 的邮箱密码注册、登录、退出和 Session 持久化。
- **今日科研日志**：记录完成事项、遇到问题和下一步计划；同一用户同一天重复保存时更新原记录。
- **用户数据隔离**：Diary 归属于当前 Session 用户，不接受客户端指定 `userId`；其他用户的日志详情返回 404。
- **历史与详情**：按日期倒序查看自己的历史日志，并进入单篇详情。
- **关键词搜索**：在当前用户的完成事项、问题和下一步计划中进行包含搜索。
- **用户时区**：按照用户设置的 IANA 时区判断“今天”，默认 `Asia/Shanghai`。
- **个人设置**：修改用户名和时区，邮箱只读。
- **个人 Dashboard**：保留今日状态与最近 3 篇 Diary；本地 v2.4 新增最多 3 个未归档项目、状态、日志总数和最近日志日期，按最近项目日志日期排序，无日志时回退项目创建时间。
- **健康检查**：`GET /api/health` 使用轻量查询检查 PostgreSQL 连接状态。
- **科研项目管理**：创建、查看、编辑项目，切换进行中/已暂停/已完成状态，归档与恢复；项目按用户隔离。
- **项目独立日志（v2.4 阶段 4）**：每个项目同一天可创建多篇日志，支持标题、日期、三个正文栏、查看、编辑、日期筛选、关键词搜索与分页；归档后日志只读，恢复后可继续写入。

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
  ├─ Route Handlers (/api/auth, /api/diary, /api/projects, /api/settings, /api/health)
  └─ Better Auth Session
        │
        ├─ current-user：从服务端 Session 获取用户身份
        │
        └─ diary-service / project-service / project-diary-service
              │
              ▼
        Prisma Client
              │
              ▼
         Neon PostgreSQL（正式环境）
```

Diary 页面、API、Dashboard、历史和搜索都通过服务端 Session 获得 `user.id`。Diary 数据访问集中在 `diary-service`，所有查询都带用户条件；客户端传入的用户 ID 不参与权限判断。

数据库中 `User` 与 `Diary` 是一对多关系，`@@unique([userId, date])` 保证同一用户每天最多一篇日志，同时允许不同用户在同一天分别记录。

本地 v2.4 的 ProjectDiary 与 Diary 独立，允许同项目同日多篇。Dashboard 项目区域在数据库内聚合计数与最近日期，仅返回 3 行，不逐项目发起查询或读取日志正文。

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
│  ├─ features/project/     # Project、ProjectDiary 与 Dashboard 聚合
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

先确认终端变量与 `.env` 明确指向本机 Docker 数据库，不能使用生产 Neon 连接：

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

staging / production 只能在独立审批后执行 `migrate deploy`，不能运行 `migrate dev`。v2.4 仅新增 `20261020152832_add_project_diaries`，该 Migration 已在生产成功应用；阶段 3–5A 没有新增 migration。

SQLite → PostgreSQL 脚本是历史本地演练工具。当前生产已经使用 Neon，不应据此再次导入、转换或切换生产数据。

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

集成测试需要可创建和删除 Schema 的独立 PostgreSQL 直连地址，优先显式设置 `TEST_DATABASE_URL`；测试辅助代码仍保留 `DIRECT_URL`、`DATABASE_URL` 回退，故运行前必须核实目标，禁止生产连接。测试会删除和重建专用测试 Schema。

GitHub Actions 会在每次 `push` 和 `pull_request` 时使用 Node.js 24.x、pnpm 10.34.6 和临时 PostgreSQL，依次执行依赖安装、Prisma Client 生成、lint、`test:deploy` 和 build。

## ☁️ 部署架构

正式部署架构为 Render + Neon；本次未访问生产控制台或数据库：

```text
GitHub
  ├─ CI：lint + tests + build
  └─ 经单独审批的 migration 执行入口（不得假定 staging workflow 就是生产流程）
        │  使用 DIRECT_URL，先完成迁移
        ▼
Neon PostgreSQL
        ▲
        │  应用运行使用 DATABASE_URL
Render / Next.js Node.js Runtime
  ├─ Better Auth
  ├─ Prisma Client
  └─ GET /api/health
```

发布顺序：核实并关闭 Render 自动部署 → 经授权同步审核代码并等待 CI → 核对备份和恢复演练 → 应用待执行 migration → 验证旧数据 → 手工发布同一 SHA → 业务与手机验收。

Render Auto-Deploy 当前保持关闭，后续发布仍需单独核实开关并按审批流程执行。完整门禁、回滚和手机检查见 [发布指南](docs/deployment.md)。

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
- [x] 维护者确认正式应用已运行于 Render + Neon
- [x] 本地 v2.4 项目与独立日志功能
- [x] 本地 Dashboard 项目集成与发布方案
- [x] 生产 Migration 成功，旧 Diary 数据完整性校验通过
- [x] v2.4 已发布并完成线上 8/8 功能验收

## 🗺️ Roadmap

### v2.4 发布结果

- [ ] 核实隔离 staging、正式域名与认证配置
- [x] Neon 生产增量 Migration 成功
- [x] Render Live commit 为 `6ff6ef57a64e62cca53bb23ba4f0917840dbffb9`，Auto-Deploy 为 Off
- [x] GitHub main CI 与线上 8/8 功能验收通过
- [ ] 补充错误监控与结构化日志

### 长期候选（未实现）

- [ ] 基于用户本人日志的阶段总结
- [ ] 历史进展、阻塞与下一步计划提炼
- [ ] 用户私有 Diary 范围内的语义检索或问答

以上 AI 方向仅为长期候选，需要先明确模型供应商、成本、隐私和数据保留策略。当前产品不提供 AI、统计图表或多人协作能力。

## 📚 项目文档

- [系统架构](docs/architecture.md)
- [数据库设计](docs/database.md)
- [开发规划](docs/development-plan.md)
- [本地开发环境](docs/development.md)
- [部署指南](docs/deployment.md)
- [API 说明](docs/api.md)
- [技术决策记录](docs/decisions.md)
