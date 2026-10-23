# 科研成长日志项目状态

更新日期：2026-10-22。本文区分生产部署事实和本地待发布功能。

## 生产状态

- 根据项目维护者确认，正式应用部署在 Render，使用 Neon PostgreSQL，并存在真实用户数据。
- 已有功能包括 Better Auth 认证、个人设置与时区、每日 Diary、历史、搜索、Dashboard 及用户隔离。
- 本次未访问生产应用或 Neon；Render 当前部署 commit、自动部署设置、Neon migration 历史及备份恢复状态尚未核实。
- v2.4 Project、ProjectDiary 和 Dashboard 项目区域仅在本地完成，不代表已经上线。

## 本地实现状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 2 | ProjectStatus、Project、ProjectDiary 与增量 migration | 已提交 `33a899c` |
| 3 | 项目管理、归档恢复、权限隔离 | 已提交 `b075da4` |
| 4 | 项目独立日志、同日多篇、编辑检索、分页、归档并发保护 | 已提交 `263e726` |
| 5A | Dashboard 最近 3 个未归档项目、测试与发布文档 | 本地实现，尚未发布；验证与提交结论见本阶段交付报告 |
| 线上发布 | Neon 增量 migration、Render 应用发布、线上验收 | 未执行，需单独授权 |

Dashboard 保留原今日 Diary 与最近 3 篇 Diary，新增项目名称、中文状态、日志总数和最近日志日期；没有项目时引导创建。排序为 `COALESCE(MAX(ProjectDiary.entryDate), Project.createdAt) DESC`，再按项目 `createdAt DESC, id ASC`。归档项目不参与聚合。

## 代码与数据边界

- 原 Diary 继续使用 `@@unique([userId, date])`，每位用户每天最多一篇。
- ProjectDiary 与 Diary 独立，同一项目同一天允许多篇；没有自动转换旧日志。
- ProjectDiary 通过 `(userId, projectId)` 复合外键约束项目所有者。
- 归档项目日志只读；事务内锁定项目行后检查归档状态，恢复不修改日志。
- Dashboard 聚合只执行一条带用户条件的 SQL，最多返回 3 行，不加载项目描述、日志标题或正文。
- 本阶段未改 Schema、历史 migration、认证配置或原 Diary 服务。

## Git 只读核对

阶段 5A 接手时，本地 `main` 位于 `263e726`。2026-10-22 使用 `git ls-remote --heads origin main` 核对 GitHub main 为 `d797164e5d3147fccce7dc0d3cb6e32f8013ab8c`；接手时本地领先该提交 3 个功能提交。

本阶段按“完整验证通过后创建本地提交”的要求交付，不 push；当前提交状态以 `git log` 和交付报告为准。恢复本地数据库验证时再次只读核对远端，两次均因网络连接失败未完成；远端在上次成功核对后仍可能变化，正式发布前需重新核对。Render 是否跟随 GitHub main 自动部署未确认，不能把 push 当成无副作用的同步步骤。

## 运行与验收

技术栈：Next.js 16、React 19、TypeScript、Tailwind CSS 4、Prisma 6、PostgreSQL、Better Auth、pnpm、GitHub Actions。`package.json` 的 `0.1.0` 是现有包版本，不等同于产品 v2.4 已发布。

检查命令：Prisma validate/generate、ESLint、`pnpm test:deploy`、`pnpm build`、`git diff --check`。集成测试只能显式指向本机或独立 CI PostgreSQL，测试会创建和删除专用 Schema；禁止使用生产连接。

阶段 5A 本地验证（2026-10-22，Node.js 24.21.0、Prisma 6.19.3、Docker PostgreSQL 17）：

- Prisma validate、generate、ESLint、Next.js production build 与 `git diff --check` 均通过。
- 全部自动化测试 18/18 通过（原有 17 项与新增 Dashboard 测试），无跳过；测试专用 Schema 已清理。
- 覆盖旧认证与 Diary 回归、迁移前后 Diary 逐字段一致、项目隔离、同日多篇、归档行锁、筛选分页，以及 Dashboard 排序、计数和双用户隔离。
- Node.js 直接加载 TypeScript 测试时有既有模块类型提示，不影响通过；未为消除提示修改包模块类型。
- 手机浏览器人工验收、生产负载测试、线上冒烟与 Neon 备份恢复演练未执行，不能视为通过。

发布步骤、未确认项和手机清单见 [发布指南](docs/deployment.md)，数据库增量细节见 [安全迁移手册](docs/project-diary-migration.md)。
