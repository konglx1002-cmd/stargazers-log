# v2.4 项目日志安全迁移

本文适用于 `20261020152832_add_project_diaries`。它是生产 Neon PostgreSQL 的上线运行手册，不代表已经获得执行线上 migration 或部署 Render 的授权。

## 1. 变更边界

该 migration 只执行以下增量操作：

- 创建 `ProjectStatus` enum。
- 创建 `Project` 表。
- 创建 `ProjectDiary` 表。
- 创建项目列表和项目日志排序索引。
- 创建 `Project -> User` 外键。
- 创建 `ProjectDiary(userId, projectId) -> Project(userId, id)` 复合外键。

它不修改或删除 `User`、`Account`、`Session`、`Verification`、`Diary`，不转换旧 Diary，也不写入业务数据。

## 2. 上线前检查

1. 确认待发布 commit 与审核通过的 migration SQL 完全一致，工作区干净，CI 的 lint、测试和 build 全部通过。
2. 在受控终端中确认 `DATABASE_URL` 指向 Render 应用使用的 Neon 连接池地址，`DIRECT_URL` 指向同一 Neon 项目的直连地址。只检查变量是否存在和目标环境标识，不打印变量值。
3. 运行只读的 `prisma migrate status`，确认生产 `_prisma_migrations` 已包含 `20261014000000_postgresql_init`，且不存在失败、漂移或未知 migration。
4. 记录发布前 User、Diary、Account、Session 数量；导出 Diary 的 `id`、`userId`、`date`、三个正文栏、`content`、`createdAt`、`updatedAt` 的受控校验摘要。摘要不得包含正文或凭据。
5. 在 Neon 确认 Point-in-Time Restore 或等价备份可用，记录恢复点时间，并实际确认操作者具备创建恢复分支/副本的权限。
6. 优先在由该恢复点创建的独立 Neon 分支或隔离 staging 数据库执行一次完整演练。演练目标不得连接 Render production。
7. 确认 Render 当前生产 commit 和上一个可回滚 commit，暂停自动部署，避免 migration 与未经审核的应用版本并发发布。

任一检查无法确认时停止，不运行 production migration。

## 3. 演练验收

在隔离数据库中运行 `prisma migrate deploy` 后验证：

- migration 状态正常且只新增目标 migration。
- 旧表行数和 Diary 校验摘要与迁移前一致。
- `Project`、`ProjectDiary` 初始为空。
- 同一 Project、同一 `entryDate` 可以插入多篇 ProjectDiary。
- 使用用户 A 的 `userId` 和用户 B 的 `projectId` 写入 ProjectDiary 会被复合外键拒绝。
- 将 Project 设置 `archivedAt` 后，ProjectDiary 数量和内容不变。
- 原 `(Diary.userId, Diary.date)` 唯一约束仍拒绝同一用户同日第二篇 Diary。

## 4. Production 执行顺序

只有在单独获得 production migration 授权后才能执行：

1. 冻结本次发布范围并确认备份恢复点。
2. 对审核通过的同一 commit 再次运行 CI 和部署前检查。
3. 通过受审批的单一 migration Job 使用 `DIRECT_URL` 运行 `prisma migrate deploy`。不得使用 `migrate dev`、`db push` 或 `migrate reset`。
4. 立即运行 `prisma migrate status`，确认 migration 已成功应用。
5. 比较发布前后的旧表数量和 Diary 校验摘要，确认 Project 与 ProjectDiary 初始为空。
6. 部署同一 commit 的 Render 应用；数据库 migration 不放入应用启动命令。
7. 先检查 `/api/health`，再验证注册、登录、Session、设置、原 Diary 创建/更新、历史、详情、搜索和双用户隔离。
8. v2.4 API 上线后，再验证项目归档、同日多篇项目日志、项目日志搜索和跨用户 404。

## 5. 应用回滚与数据库恢复

该 migration 对旧应用是向前兼容的：旧版本不会访问新表。若 Render 新版本异常，优先回滚应用到上一个已验证 commit，同时保留新增表和 migration 记录。

不要在已写入 Project 或 ProjectDiary 数据后通过 `DROP TABLE` 回滚数据库。修复 Schema 或约束时创建新的前向 migration。

若 migration 执行期间失败：

1. 停止应用发布，不手工编辑 `_prisma_migrations`。
2. 保存不含连接信息和业务正文的错误日志，检查实际已执行到哪一条 SQL。
3. 保持 production 写入受控，选择经审核的前向修复 migration；如果旧数据完整性受到影响，则从上线前恢复点创建恢复分支并验证。
4. 只有在恢复副本完成旧数据数量、ID、日期、正文摘要和认证冒烟验证后，才执行流量切换。

恢复 Neon 数据库不会自动回滚 Render 应用。数据库恢复与应用版本必须作为同一个发布事件协调处理。

## 6. 本地验证证据

自动化测试 `tests/project-diary-migration.test.mjs` 使用独立 PostgreSQL Schema：

- 从空 migration 历史部署全部 migration。
- 只部署初始 migration，写入两个用户和旧 Diary，再应用 v2.4 migration。
- 逐字段比较 migration 前后的 Diary。
- 验证同项目同日多篇、排序、复合外键、用户范围更新、软归档和原 Diary 唯一约束。

测试数据库必须通过显式的本机或 CI `TEST_DATABASE_URL` 提供。无法证明目标隔离时禁止运行测试。
