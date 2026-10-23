# 系统架构

## 1. 项目定位与当前范围

科研成长日志是一个基于 Web 的多人科研记录工具。正式应用为 Render + Neon（依据维护者确认），本次未访问生产环境；下文描述当前本地代码，不代表 v2.4 已上线。已有基础功能包括：

- Diary MVP：创建、读取和更新当日日志。
- 历史日志列表与日志详情。
- 按关键词搜索日志。
- 基于邮箱和密码的注册、登录、退出及 Session 持久化。
- 用户级 Diary 数据隔离。
- 按用户时区判断“今天”，默认时区为 `Asia/Shanghai`。
- 用户个人设置页面，可修改用户名和时区。
- 登录后的基础 Dashboard，包括今日状态、最近 3 篇日志和快捷入口。

v2.4 提供科研项目管理及项目独立日志：每个项目可在同日创建多篇日志，支持查看、编辑、日期筛选和关键词搜索。当前没有标签、统计图表或 AI 功能。

## 2. 技术栈

| 层级 | 当前技术 |
| --- | --- |
| Web 框架 | Next.js 16，App Router |
| UI | React 19、TypeScript、Tailwind CSS 4 |
| 数据访问 | Prisma 6 |
| 数据库 | Neon PostgreSQL（正式环境）；Docker PostgreSQL（本地测试） |
| 应用部署 | Render（实际 live SHA 和自动部署设置待核实） |
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

Dashboard 的今日状态使用 `getTodayDiary(user.id, user.timeZone)`，最近日志使用 `getRecentDiaries(user.id)`，后者在用户条件内按日期倒序取 3 条。项目区域调用 `project-service.getDashboardProjects(user.id)`；三项业务查询并行执行，首页不直接访问 Prisma。未登录时不执行这些个人业务查询。

### 4.3 今日日期

当前用户的 `timeZone` 保存在 `User` 中，并随 Session 用户数据返回。今日记录接口把 Session 中的 `user.id` 和 `user.timeZone` 一起传给 Diary 服务。服务使用 `Intl.DateTimeFormat` 将当前时间转换成该时区的 `YYYY-MM-DD` 日期键，再查询或写入当日日志。

### 4.4 科研项目管理

`src/features/project/project-service.ts` 集中处理 Project 数据访问与字段校验，页面和 `/api/projects`、`/api/projects/[id]` 均复用它。所有查询使用服务端 Session 的 `user.id`，更新通过 `(userId, id)` 复合唯一键限定所有者，不接受客户端指定身份。

`/projects` 和详情、编辑页面由服务端组件鉴权并加载数据，创建/编辑表单与归档按钮使用客户端组件调用 JSON API。列表默认未归档，`?archived=true` 只展示已归档项目。归档只更新 `archivedAt`，恢复设为 `null`，不修改 ProjectDiary 或原 Diary。

项目管理没有物理删除接口。Dashboard 最近项目模块已在本地接入，尚未发布。

项目区域使用一条参数化 SQL：限定当前用户和未归档项目，在数据库内 LEFT JOIN 同用户 ProjectDiary，聚合 COUNT 与 MAX(entryDate)，按 `COALESCE(MAX(entryDate), Project.createdAt) DESC, Project.createdAt DESC, Project.id ASC` 排序，LIMIT 3。日志日期为 UTC 零点日期键，无日志时才用创建时间作为回退。三个状态都参与，归档项目不参与。只传回 ID、名称、状态、计数和最近日期，不加载描述/日志正文，没有逐项目查询。

准确聚合仍会处理当前用户符合条件的项目及日志，LIMIT 3 限制的是返回量，不是扫描量。现有 `(userId, archivedAt, status)` 与日志 `(userId, projectId, entryDate, createdAt, id)` 索引可支持用户/项目条件；大规模性能需在隔离环境分析，不把本地测试等同于生产容量保证。

### 4.5 项目独立日志

`src/features/project/project-diary-service.ts` 处理项目日志读取、创建、编辑、筛选和分页。原 Diary 模块不参与项目日志写入，保留用户每日唯一规则。ProjectDiary 查询同时限定 Session `user.id`、项目 ID 和（详情/编辑时的）日志 ID。

新建与编辑表单共用 `project-diary-form.tsx`，字段长度及日期校验位于 `project-diary-types.ts`，供浏览器和服务端使用。创建日期默认按用户时区计算；如果旧用户配置异常，仅项目日志回退默认 `Asia/Shanghai`，不改变原 Diary 时区处理。

新增和编辑必须在同一个交互事务内锁定所属 Project 行，再检查 `archivedAt`。已有项目归档 UPDATE 会竞争相同行锁，因此不存在“事先检查未归档、归档完成后仍继续写入”的间隙。事务完成后释放锁；事务错误回滚，不写入部分日志。

列表查询只取一页加一条，最多 21 条；日期精确匹配和四栏关键词包含条件均位于当前用户、当前项目内。页面默认每页 20 条，支持最多 1000 页，保留筛选条件翻页。

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

正式应用已使用 Render + Neon；Prisma 与 Better Auth 复用 PostgreSQL。v2.4 的本地 migration、项目功能和 Dashboard 集成尚未生产发布；Neon 实际迁移历史、备份恢复窗口与 Render live SHA、自动部署配置本次均未核实。

## 7. 发布架构与边界

仓库已准备：

- 使用 `.nvmrc` 和 `packageManager` 固定 Node.js 与 pnpm 版本。
- 使用 `.env.production.example` 定义变量接口，不保存真实密钥。
- 明确区分本地开发迁移 `db:migrate:dev` 与生产迁移 `db:migrate:deploy`。
- 建立本地、staging 和 production 的部署流程文档。

应用流量应使用 Neon 连接池地址，批准后的迁移入口使用直连地址。Better Auth 由 Next.js 提供接口，不引入独立认证服务。生产备份与恢复必须验证实际可用性，不能把已有运行手册当作演练已通过。

原 SQLite migration 只作为历史归档。本次 v2.4 是在现有 Neon 上的增量发布，不进行数据库引擎转换。CI、staging migration workflow 与 Render 发布是不同入口，任何 push 或云端变更都需要发布授权；具体门禁见 [deployment.md](deployment.md)。

