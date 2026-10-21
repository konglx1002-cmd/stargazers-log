# API 说明

## 1. 通用约定

- Diary API 和用户设置 API 使用 JSON。
- 用户身份来自 Better Auth Session Cookie。
- 未登录访问 Diary API 返回 `401` 和 `{ "message": "请先登录" }`。
- 客户端不需要、也不能通过传入 `userId` 指定数据归属。
- 当前没有公开的 Diary 删除 API，也没有单独的 Diary 详情 JSON API。

## v2.4 科研项目管理（阶段 3）

所有 Project API 使用 Better Auth Session；未登录返回 `401`。项目详情和更新只查询当前用户，不存在和其他用户的项目均返回 `404` 与 `{ "message": "项目不存在" }`。响应不包含 `userId`。

| 方法与路径 | 行为 |
| --- | --- |
| `GET /api/projects` | 返回 `{ "projects": [...] }`，默认仅未归档项目 |
| `GET /api/projects?archived=true` | 仅返回已归档项目；`false` 等价于默认，其余值返回 `400` |
| `POST /api/projects` | 接收 `name` 和可选 `description`，返回 `201` 与 `{ "project": {...} }` |
| `GET /api/projects/[id]` | 读取当前用户项目，已归档项目也可读取 |
| `PATCH /api/projects/[id]` | 更新一个或多个 `name`、`description`、`status`、`archived` 字段，返回 `{ "project": {...} }` |

项目返回字段：`id`、`name`、`description`、`status`、`archivedAt`、`createdAt`、`updatedAt`。时间为 ISO 字符串，未归档时 `archivedAt` 为 `null`。列表按 `updatedAt DESC, id ASC` 稳定排序。

校验规则：

- `name` 去除首尾空白后不能为空，最多 100 个 UTF-16 代码单元，与 HTML `maxLength` 一致；允许同一用户重名。
- `description` 必须是字符串，最多 5000 个 UTF-16 代码单元；省略时默认空字符串。
- 新建默认状态为 `ACTIVE`，创建请求只接受 `name`、`description`。
- 更新 `status` 只能为 `ACTIVE`、`PAUSED`、`COMPLETED`。
- `archived` 只能为布尔值；`true` 由服务端记录当前归档时间，`false` 恢复为 `null`，不改变项目状态和日志。
- 不接受 `userId`、`id`、`archivedAt` 或其他未知字段。空更新、非法 JSON、数组、非法字段类型和超长输入返回 `400`。
- 未实现 `DELETE`，请求会返回 `405`。归档与恢复不删除 Project、ProjectDiary 或原 Diary。

页面：`/projects`、`/projects/new`、`/projects/[id]`、`/projects/[id]/edit`。所有页面服务端鉴权；未登录重定向 `/login`，他人项目和不存在的项目返回 404。列表通过 `/projects?archived=true` 单独查看已归档项目。

## v2.4 项目独立日志（阶段 4）

| 方法与路径 | 行为 |
| --- | --- |
| `GET /api/projects/[id]/diaries` | 当前项目日志列表，返回 `diaries`、`page`、`pageSize`、`hasNext` |
| `POST /api/projects/[id]/diaries` | 每次新建独立日志，返回 `201` 和 `{ "diary": {...} }` |
| `GET /api/projects/[id]/diaries/[diaryId]` | 当前用户、当前项目内指定日志 |
| `PATCH /api/projects/[id]/diaries/[diaryId]` | 只更新指定日志，返回 `{ "diary": {...} }` |

创建字段：`title`、`completedTasks`、`problems`、`nextPlan` 都必须为字符串；`entryDate` 可省略，省略时根据 Session 用户 IANA 时区计算日期。无效的旧用户时区回退 `Asia/Shanghai`。编辑可以提交上述字段的任意非空子集。

- 标题去除首尾空格后必填，最多 200 个 UTF-16 代码单元；三个正文栏分别最多 20,000 个 UTF-16 代码单元，可为空文本，前后端共用校验函数和长度常量。
- 日期只接受 `0001-01-01` 至 `9999-12-31` 的真实 `YYYY-MM-DD` 日期，允许历史日期，不接受日期时间字符串、溢出日期或无效闰日。以相应 UTC 零点保存日期键，实际创建时刻另存 `createdAt`。
- 不接受 `userId`、`projectId`、`id`、时间戳或其他未知字段。非法请求返回 `400`。
- 创建使用 `create`，没有按日期 upsert；同项目同日允许多篇。编辑同时限定 `id`、`userId`、`projectId`。
- 所有 API 未登录返回 `401`；他人项目、他人日志、不匹配的项目/日志组合和不存在资源统一 `404`。
- 归档项目可读取和搜索日志；新增或编辑返回 `409`。恢复归档不修改已有日志。ACTIVE、PAUSED、COMPLETED 均允许写入未归档项目日志。
- 写入事务执行带用户条件的 Project `SELECT ... FOR UPDATE`，在持有行锁期间检查归档状态并创建或更新日志。Project 归档的 UPDATE 与该锁互斥：归档先提交时，排队的写入重新读取归档状态并拒绝；写入先拿锁时，先完成写入，归档随后生效。

列表查询参数：

| 参数 | 默认值与规则 |
| --- | --- |
| `date` | 可选，精确匹配日志日期；空值表示全部日期 |
| `q` | 可选，最多 200 个 UTF-16 代码单元，在标题及三个正文栏内执行不区分大小写的包含搜索；空白表示不搜索 |
| `page` | 默认 1，只接受 1–1000 的整数页码；每页固定 20 条 |

日期和关键词可组合，始终叠加当前 Session 用户与项目条件。排序为 `entryDate DESC, createdAt DESC, id ASC`。单次只取最多 21 条判断下一页，不执行全部结果计数；超过 1000 页时需缩小日期或搜索范围。偏移分页期间若有新增/编辑，页面内容可能移动，刷新或重新筛选可重新读取当前顺序。

项目详情页 `/projects/[id]` 提供列表、日期/关键词筛选、分页和新建入口。独立页面包括 `/projects/[id]/diaries/new`、`/projects/[id]/diaries/[diaryId]`、`/projects/[id]/diaries/[diaryId]/edit`。归档时列表/详情仍可读，但不提供日志新建或编辑入口；直接访问新建/编辑页显示只读提示，不渲染表单。原 Diary API 不变。

## 2. 健康检查

### `GET /api/health`

供部署平台检查应用及 PostgreSQL 是否可用。该接口无需登录，只通过当前 Prisma Client 执行轻量的 `SELECT 1`，不会读取业务数据。

数据库连接正常时返回 `200`：

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-10-14T03:00:00.000Z"
}
```

数据库不可用时返回 `503`：

```json
{
  "status": "error",
  "database": "disconnected"
}
```

失败响应不会包含数据库错误详情、连接地址、环境变量或 Secret。

## 3. 认证 API

Better Auth 通过以下统一 Route Handler 提供认证能力：

```text
/api/auth/[...all]
```

当前前端实际使用的能力包括：

| 路径 | 方法 | 用途 |
| --- | --- | --- |
| `/api/auth/sign-up/email` | POST | 用户名、邮箱和密码注册 |
| `/api/auth/sign-in/email` | POST | 邮箱密码登录 |
| `/api/auth/sign-out` | POST | 退出当前 Session |
| `/api/auth/get-session` | GET | 获取当前 Session 和用户 |

认证请求、响应、Cookie 和密码处理由 Better Auth 定义。`User.timeZone` 是 Better Auth 的附加用户字段，默认 `Asia/Shanghai`；服务端会拒绝非法时区。

## 4. 用户设置

### `GET /api/settings`

返回当前 Session 用户的可展示设置：

```json
{
  "settings": {
    "name": "用户名",
    "email": "user@example.com",
    "timeZone": "Asia/Shanghai"
  }
}
```

### `PUT /api/settings`

### `PATCH /api/settings`

两个方法都支持更新 `name`、`timeZone` 中的一个或两个字段。用户名去除首尾空白后不能为空，时区必须是服务端可识别的 IANA 时区。邮箱只读，当前不能通过该 API 修改。

```json
{
  "name": "新用户名",
  "timeZone": "Asia/Tokyo"
}
```

用户身份只取自 Better Auth Session；请求体包含 `userId` 时返回 `400`。请求体包含 `email` 时也返回 `400`，不会修改邮箱。

## 5. 今日 Diary

### `GET /api/diary/today`

根据当前 Session 用户的时区返回“今天”和该日期的 Diary。

成功响应：

```json
{
  "date": "2026-10-13",
  "diary": {
    "id": "diary-id",
    "date": "2026-10-13",
    "completedTasks": "完成事项",
    "problems": "遇到的问题",
    "nextPlan": "下一步计划",
    "createdAt": "2026-10-13T08:00:00.000Z",
    "updatedAt": "2026-10-13T09:00:00.000Z"
  }
}
```

当天尚无 Diary 时，`diary` 为 `null`。

### `POST /api/diary/today`

### `PUT /api/diary/today`

两个方法当前执行相同的 upsert：不存在则创建，存在则更新。

请求体：

```json
{
  "completedTasks": "完成事项",
  "problems": "遇到的问题",
  "nextPlan": "下一步计划"
}
```

三个字段都必须是字符串，否则返回 `400`。服务端使用 Session 中的 `user.id` 和 `user.timeZone`，不采用请求体中的额外身份字段。

成功响应：

```json
{
  "diary": {
    "id": "diary-id",
    "date": "2026-10-13",
    "completedTasks": "完成事项",
    "problems": "遇到的问题",
    "nextPlan": "下一步计划",
    "createdAt": "2026-10-13T08:00:00.000Z",
    "updatedAt": "2026-10-13T09:00:00.000Z"
  }
}
```

## 6. 历史 Diary

### `GET /api/diary`

返回当前用户的全部 Diary，按 `date` 倒序排列。

```json
{
  "diaries": []
}
```

响应中的每个条目使用与今日 Diary 相同的公开字段，不包含 `userId` 和当前未使用的 `content`。

## 7. 搜索 Diary

### `GET /api/diary/search?q=关键词`

在当前用户范围内，对以下字段执行包含匹配：

- `completedTasks`
- `problems`
- `nextPlan`

结果按 `date` 倒序排列。`q` 缺失、为空或只包含空白时返回空数组。

```json
{
  "diaries": []
}
```

## 8. 页面侧详情读取

`/diary/[id]` 不是 JSON API。该服务端页面调用 `getDiaryById(currentUser.id, id)`：

- 未登录时重定向到 `/login`。
- Diary 属于当前用户时展示详情。
- Diary 不存在或属于其他用户时返回 404。

## 9. 当前错误响应

| 场景 | 状态码 | 当前消息 |
| --- | --- | --- |
| 未登录访问 Diary API | 401 | `请先登录` |
| 未登录访问用户设置 API | 401 | `请先登录` |
| 用户设置请求包含 `userId` | 400 | `不能指定用户身份` |
| 用户设置请求尝试修改邮箱 | 400 | `邮箱暂不支持修改` |
| 用户名为空 | 400 | `用户名不能为空` |
| 时区无效 | 400 | `请输入有效的 IANA 时区` |
| 用户设置保存失败 | 500 | `保存设置失败` |
| Diary 请求体格式错误 | 400 | `日志内容格式不正确` |
| 今日 Diary 读取失败 | 500 | `读取日志失败` |
| 今日 Diary 保存失败 | 500 | `保存日志失败` |
| 历史读取失败 | 500 | `读取历史日志失败` |
| 搜索失败 | 500 | `搜索日志失败` |

## 10. Dashboard 数据访问

Dashboard 没有新增公开 JSON API。登录后的 `/` 是服务端页面，从 Better Auth Session 获取当前用户，并通过 `diary-service` 调用：

- `getTodayDiary(user.id, user.timeZone)`：返回用户时区下的今日日期和今日 Diary 状态。
- `getRecentDiaries(user.id)`：只查询当前用户，按日期倒序返回最多 3 篇 Diary。

未登录访问 `/` 时不会执行个人 Diary 查询，只展示产品介绍以及登录、注册入口。

