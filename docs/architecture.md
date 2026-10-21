# 系统架构

## 1. 项目定位与当前范围

科研成长日志是一个基于 Web 的多人科研记录工具。当前系统已经完成：

- Diary MVP：创建、读取和更新当日日志。
- 历史日志列表与日志详情。
- 按关键词搜索日志。
- 基于邮箱和密码的注册、登录、退出及 Session 持久化。
- 用户级 Diary 数据隔离。
- 按用户时区判断“今天”，默认时区为 `Asia/Shanghai`。
- 用户个人设置页面，可修改用户名和时区。
- 登录后的基础 Dashboard，包括今日状态、最近 3 篇日志和快捷入口。

v2.4 阶段 3 新增科研项目的创建、列表、详情、编辑、状态切换、归档与恢复。ProjectDiary 页面和 API 留到阶段 4。当前没有标签、统计图表或 AI 功能。

## 2. 技术栈

| 层级 | 当前技术 |
| --- | --- |
| Web 框架 | Next.js 16，App Router |
| UI | React 19、TypeScript、Tailwind CSS 4 |
| 数据访问 | Prisma 6 |
| 数据库 | PostgreSQL（本地适配完成，尚未部署云端） |
| 认证 | Better Auth，Prisma Adapter，邮箱密码认证 |
| 测试 | Node.js 内置测试运行器 |
| 代码检查 | ESLint |

## 3. 代码结构

```text
src/
  app/                         页面与 Route Handlers
    api/auth/[...all]/         Better Auth 统一入口
    api/diary/                 Diary JSON API
    diary/                     今日记录和详情页面
    history/                   历史列表页面
    search/                    搜索页面
    settings/                  用户个人设置页面
    login/、register/          认证页面
  components/                  导航与认证表单组件
  features/diary/              Diary 服务、类型和格式化逻辑
  lib/                         Prisma、Better Auth、当前用户和时区工具
prisma/
  schema.prisma                数据模型
  migrations/                  数据库迁移
tests/                         认证、Diary 隔离和时区测试
```

## 4. 请求与数据流

### 4.1 认证

1. 登录、注册和退出组件通过 Better Auth 客户端调用 `/api/auth/*`。
2. `src/app/api/auth/[...all]/route.ts` 将请求交给 Better Auth。
3. Better Auth 使用 Prisma Adapter 读写 `User`、`Session`、`Account` 和 `Verification`。
4. 服务端通过 `getCurrentUser()` 从请求头和 Session 获取当前用户。

密码散列、Session Cookie 和认证端点由 Better Auth 管理，业务代码不自行实现密码或 Cookie 逻辑。

### 4.2 Diary

```text
页面或客户端表单
  -> Next.js 页面 / Route Handler
  -> getCurrentUser() 获取 Session 用户
  -> diary-service 传入 user.id
  -> Prisma 查询或写入 PostgreSQL
```

`diary-service` 是当前 Diary 数据访问边界。历史、搜索、详情和今日记录的查询都要求传入服务端获得的 `userId`。客户端请求体中的 `userId` 不参与权限判断或数据写入。

Dashboard 同样只通过 `diary-service` 获取数据：今日状态使用 `getTodayDiary(user.id, user.timeZone)`，最近日志使用 `getRecentDiaries(user.id)`，后者在用户条件内按日期倒序取 3 条。首页不直接访问 Prisma。

### 4.3 今日日期

当前用户的 `timeZone` 保存在 `User` 中，并随 Session 用户数据返回。今日记录接口把 Session 中的 `user.id` 和 `user.timeZone` 一起传给 Diary 服务。服务使用 `Intl.DateTimeFormat` 将当前时间转换成该时区的 `YYYY-MM-DD` 日期键，再查询或写入当日日志。

### 4.4 科研项目管理

`src/features/project/project-service.ts` 集中处理 Project 数据访问与字段校验，页面和 `/api/projects`、`/api/projects/[id]` 均复用它。所有查询使用服务端 Session 的 `user.id`，更新通过 `(userId, id)` 复合唯一键限定所有者，不接受客户端指定身份。

`/projects` 和详情、编辑页面由服务端组件鉴权并加载数据，创建/编辑表单与归档按钮使用客户端组件调用 JSON API。列表默认未归档，`?archived=true` 只展示已归档项目。归档只更新 `archivedAt`，恢复设为 `null`，不修改 ProjectDiary 或原 Diary。

项目管理没有物理删除接口。项目独立日志和 Dashboard 最近项目模块尚未接入。

## 5. 页面边界

| 页面 | 当前行为 |
| --- | --- |
| `/` | 未登录展示产品介绍和登录/注册入口；登录后展示当前用户 Dashboard |
| `/login` | 邮箱密码登录 |
| `/register` | 用户名、邮箱和密码注册 |
| `/diary` | 通过今日 Diary API 加载和保存记录；未登录请求会得到 401 |
| `/history` | 服务端获取当前用户；未登录重定向到 `/login` |
| `/search` | 服务端获取当前用户；未登录重定向到 `/login` |
| `/diary/[id]` | 仅查询当前用户的 Diary；他人 Diary 或不存在的 ID 返回 404 |
| `/settings` | 展示当前用户资料，可修改用户名和时区；未登录重定向到 `/login` |

## 6. 云端演进边界

当前架构通过 Prisma 隔离数据库访问。Prisma Schema 和 Better Auth Adapter 已切换到 PostgreSQL，并建立了独立的 PostgreSQL migration 历史；云端资源、SQLite 数据迁移、备份恢复和生产环境密钥仍未实施。

## 7. v2.2 云端化架构计划

Phase 0 已完成部署工程准备：

- 使用 `.nvmrc` 和 `packageManager` 固定 Node.js 与 pnpm 版本。
- 使用 `.env.production.example` 定义未来云端环境变量接口，不保存真实密钥。
- 明确区分本地开发迁移 `db:migrate:dev` 与生产迁移 `db:migrate:deploy`。
- 建立本地、staging 和 production 的部署流程文档。

Phase 1 已完成 PostgreSQL 数据库适配和本地验证。后续目标架构为 Next.js Node.js 应用、托管 PostgreSQL 和 Better Auth。应用流量使用 PostgreSQL 连接池地址，发布流水线通过数据库直连地址执行已经提交的 migration。Better Auth 仍由 Next.js 提供接口并通过 Prisma 保存用户、账户和 Session，不引入独立认证服务。

原 SQLite migration 已归档且不会被 PostgreSQL 执行。实际 SQLite 数据、托管资源和上线流水线属于后续 Phase，Phase 1 没有迁移生产数据或进行部署。

