# 数据库设计

## 1. 当前数据库

项目当前 Schema 已适配 PostgreSQL，由 Prisma 管理模型和 PostgreSQL migration。应用运行时通过 `DATABASE_URL` 连接数据库，Prisma Migrate 通过 `DIRECT_URL` 使用直连地址。

生产环境由 Render 运行应用并连接 Neon PostgreSQL。仓库不保存生产连接信息；所有本地迁移验证必须显式使用可丢弃的测试数据库，不能依赖未确认的环境变量。

## 2. 模型概览

```text
User 1 ─── * Session
User 1 ─── * Account
User 1 ─── * Diary
User 1 ─── * Project 1 ─── * ProjectDiary

Verification 独立保存认证验证数据
```

### 2.1 User

| 字段 | 类型 | 约束或用途 |
| --- | --- | --- |
| `id` | String | 主键，由认证系统使用 |
| `name` | String | 用户显示名称 |
| `email` | String | 唯一 |
| `emailVerified` | Boolean | 默认 `false` |
| `timeZone` | String | 默认 `Asia/Shanghai`，用于计算用户的“今天” |
| `image` | String? | 可选头像地址，当前 UI 未使用 |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |

`User` 与 `Session`、`Account`、`Diary`、`Project` 都是一对多关系。

用户设置 API 只允许当前 Session 用户修改自己的 `name` 和 `timeZone`。`email` 当前只读，不提供修改入口；设置更新不会接受客户端指定的 `userId`。

### 2.2 Diary

| 字段 | 类型 | 约束或用途 |
| --- | --- | --- |
| `id` | String | CUID 主键 |
| `userId` | String | 必填外键，关联 `User.id` |
| `date` | DateTime | 日志日期 |
| `completedTasks` | String | 完成事项 |
| `problems` | String | 遇到问题 |
| `nextPlan` | String | 下一步计划 |
| `content` | String | 历史保留字段，当前页面和 API 不使用 |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |

关键约束：

- `@@unique([userId, date])`：同一用户同一天最多一篇 Diary。
- 不同用户可以在同一天分别创建 Diary。
- `Diary.userId -> User.id` 使用级联删除。

Diary 日期由用户时区计算成 `YYYY-MM-DD`，再以对应 UTC 零点的 `DateTime` 保存。它表达的是日志日期键，而不是日志创建瞬间。

### 2.3 Project

| 字段 | 类型 | 约束或用途 |
| --- | --- | --- |
| `id` | String | CUID 主键 |
| `userId` | String | 必填外键，关联 `User.id` |
| `name` | String | 项目名称；同一用户允许重名 |
| `description` | String | 项目描述，默认空字符串 |
| `status` | ProjectStatus | `ACTIVE`、`PAUSED` 或 `COMPLETED`，默认 `ACTIVE` |
| `archivedAt` | DateTime? | 软归档时间；空值表示未归档 |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |

项目不提供物理删除业务操作。归档只更新 `archivedAt`，不会修改或删除项目日志。`@@unique([userId, id])` 为 ProjectDiary 的复合外键提供数据库级租户边界；它不限制项目名称。

### 2.4 ProjectDiary

| 字段 | 类型 | 约束或用途 |
| --- | --- | --- |
| `id` | String | CUID 主键，也是唯一性来源 |
| `userId` | String | 项目所有者，用于所有查询的用户范围约束 |
| `projectId` | String | 所属 Project |
| `title` | String | 项目日志标题 |
| `entryDate` | DateTime | 用户选择的日志日期，不是创建时间 |
| `completedTasks` | String | 完成事项，与原 Diary 命名保持一致 |
| `problems` | String | 遇到的问题 |
| `nextPlan` | String | 下一步计划 |
| `createdAt` | DateTime | 实际创建时间 |
| `updatedAt` | DateTime | 更新时间 |

ProjectDiary 没有 `(projectId, entryDate)` 唯一约束，因此同一项目同一天可以保存任意多篇日志。常用列表按 `entryDate DESC, createdAt DESC, id ASC` 排序，并有对应的复合索引。

`(ProjectDiary.userId, ProjectDiary.projectId)` 通过复合外键引用 `(Project.userId, Project.id)`。数据库会拒绝把用户 A 的 ProjectDiary 写入用户 B 的 Project。每篇 ProjectDiary 只有一个必填 `projectId`，不会与原 Diary 建立关系。

`entryDate` 不设置数据库默认值，因为数据库无法从记录本身安全获得当前用户的 IANA 时区。未来创建 API 在调用方未提供日期时，必须复用服务端时区工具计算用户本地 `YYYY-MM-DD`，再保存为对应的 UTC 零点日期键，避免 UTC 日期偏差。

### 2.5 Better Auth 模型

- `Session`：保存 Session Token、过期时间、客户端信息和所属用户；`token` 唯一，`userId` 有索引。
- `Account`：保存认证提供方账号信息。当前启用邮箱密码认证，密码数据由 Better Auth 管理。
- `Verification`：保存认证流程所需的临时验证数据，`identifier` 有索引。

## 3. 用户数据隔离

隔离不依赖客户端提供用户 ID，而由服务端执行：

1. Route Handler 或服务端页面从 Better Auth Session 获取当前用户。
2. 调用 Diary 服务时传入 `user.id`。
3. 所有 Diary 查询都带有 `userId` 条件。
4. 今日记录使用复合唯一键 `userId_date` 查询和 upsert。
5. 日志详情使用 `{ id, userId }` 联合条件查询；其他用户的 Diary 与不存在的 Diary 都返回 404。
6. 历史列表和搜索同样使用 `where: { userId }`，搜索条件位于该用户范围之内。

因此，客户端即使额外发送 `userId`，也不会改变数据归属或扩大查询范围。

用户设置使用相同的隔离原则：服务端从 Session 获取 `User.id`，并只以该主键更新用户记录。请求体如果包含 `userId` 会直接返回 `400`。

未来 Project 与 ProjectDiary API 必须使用相同原则：只采用 Session 的 `user.id`，所有查询和更新同时限定 `userId`。不存在和不属于当前用户的资源统一返回 `404`。复合外键保护写入归属，但不替代应用层读取授权。

## 4. Migration 历史

当前生效的 PostgreSQL migration 位于 `prisma/migrations`：

| 迁移 | 作用 |
| --- | --- |
| `20261014000000_postgresql_init` | 从空 PostgreSQL 数据库创建当前完整的 User、Account、Session、Verification 和 Diary 结构 |
| `20261020152832_add_project_diaries` | 增量创建 ProjectStatus、Project、ProjectDiary、索引和复合外键；不修改旧业务表 |

原 SQLite migration 未被修改或复用，完整归档在 `prisma/migrations-sqlite-legacy`。该目录只用于追溯旧数据库演进，不会被 `prisma migrate dev` 或 `prisma migrate deploy` 执行。

PostgreSQL 初始 migration 直接表达当前 Schema，使用 PostgreSQL 的 `TIMESTAMP(3)`、外键、索引和复合唯一约束。后续数据库修改只能在该 PostgreSQL 历史上新增 migration。

## 5. PostgreSQL 类型兼容性

- Prisma `String` 映射为 PostgreSQL `TEXT`。
- Prisma `Boolean` 映射为 PostgreSQL `BOOLEAN`。
- Prisma `DateTime` 映射为 `TIMESTAMP(3)`。
- `User.email`、`Session.token` 和 `(Diary.userId, Diary.date)` 的唯一约束保持不变。
- `Session`、`Account`、`Diary` 到 `User` 的外键继续使用级联删除。
- Diary 日期仍按用户时区计算为日期键并保存为 UTC 零点 `DateTime`，业务逻辑没有改变。
- ProjectDiary 以独立 `id` 为主键，同一项目同一日期可有多行。
- ProjectDiary 的复合外键要求 `userId` 与所属 Project 的 `userId` 一致。

## 6. 数据库连接

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 应用运行时连接。云端可以使用连接池地址；本地可以使用直连地址 |
| `DIRECT_URL` | Prisma migration 和管理操作使用的直连地址 |

本地 PostgreSQL 没有连接池时，两者可以使用同一个 URL。Staging 和 production 必须分别使用自己的数据库和凭据。

## 7. 数据迁移边界

Phase 1 没有把 SQLite 数据导入 PostgreSQL。后续数据迁移仍需单独处理 User、Account、Diary 数据，保留所有 ID、关联、密码哈希、日期和内容，并验证迁移前后的数量与内容一致性。归档的 SQLite migration 不能在 PostgreSQL 上执行。

v2.4 项目日志 migration 是纯增量变更：不转换旧 Diary，不修改 Better Auth 表，也不为旧 Diary 自动创建 ProjectDiary。正式上线步骤和恢复边界见 [v2.4 项目日志安全迁移](project-diary-migration.md)。

