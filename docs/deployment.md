# Render + Neon 发布指南与 v2.4 检查单

校准日期：2026-10-22。正式应用已部署在 Render，数据库为 Neon PostgreSQL，且存在真实数据（依据项目维护者确认）。v2.4 阶段 2–5A 的功能目前仅在本地完成，尚未生产发布。

本文是待审批的执行方案。阶段 5A 只做本地开发、隔离测试及公开资料核对；未访问 Neon、操作 Render、触发 migration workflow 或 push。

## 1. 发布前尚未确认的事实

| 项目 | 当前结论 | 下一发布阶段的核对方式 |
| --- | --- | --- |
| GitHub main | 2026-10-22 上次成功只读核对为 `d797164e5d3147fccce7dc0d3cb6e32f8013ab8c`；恢复验证时再次核对因网络失败，未确认是否变化 | 发布前重新 `git ls-remote --heads origin main`，比对完整目标 SHA |
| 本地提交 | 接手时 `main` 为 `263e726`，领先远端 3 个功能提交；5A 再新增本地提交 | `git status --short --branch`、`git log --oneline origin/main..HEAD`，重新核实远端追踪引用是否最新 |
| Render live commit | 未确认，不根据 GitHub main 推断 | 在 Render Deploys 页面记录当前 live commit 和可回滚 deploy |
| Render 分支与 Auto-Deploy | 未确认，仓库没有 Render 声明式配置 | 只读查看 Settings 中关联仓库、Branch、Auto-Deploy、构建/启动命令 |
| Render 健康检查 | 未确认平台设置 | 确认 Health Check Path 为 `/api/health` |
| Neon migration | 未查询生产库 | 获授权后只读核对 migration 表、DDL、索引及外键 |
| Neon 恢复窗口与备份 | 未确认，不能假定套餐具备足够 PITR 窗口 | 查看实际项目设置和恢复权限，完成独立副本恢复演练 |
| 手机与线上冒烟 | 未执行 | 按第 7、9 节逐项留存结果 |

Render 可以在关联分支 push 后自动部署，也可配置等待 CI 或关闭自动部署。因此，未来即使只打算 push 代码，也必须先核实自动部署开关；等待 CI 并不等于等待数据库 migration。[Render 自动部署说明](https://render.com/docs/deploys)

## 2. 本地与 staging 验证

本地环境见 [development.md](development.md)。使用仓库 Docker PostgreSQL，确认容器健康，并在每条测试命令进程中显式设置本机数据库变量。不要让 Prisma 或测试回退到来源未知的 `.env`。

```bash
pnpm exec prisma validate
pnpm exec prisma generate
pnpm lint
pnpm test:deploy
pnpm build
git diff --check
```

集成测试会创建、迁移并删除专用 Schema，不能运行在 Neon production 上。CI 使用临时 PostgreSQL service container；完整测试包含原有 17 项回归及新 Dashboard 测试。

staging 必须使用独立应用、数据库/分支和认证密钥。若为恢复演练复制了真实数据，应限制访问，不公开演练应用，不把账号、密码哈希、Session 或正文放入日志或 CI artifacts。

## 3. Neon migration 核对与备份恢复

以下所有生产操作留待单独授权后执行：

- [ ] 确认 `DATABASE_URL` 为应用连接池地址、`DIRECT_URL` 为同一 Neon 目标的直连地址；凭据由受控环境注入，不粘贴或打印连接字符串。
- [ ] 运行只读 `prisma migrate status` 核对迁移历史。该命令不等于完整 Schema 漂移验证。
- [ ] 只读查看 `_prisma_migrations` 的 `migration_name`、`checksum`、`finished_at`、`rolled_back_at`，与目标 commit 的迁移文件核对。
- [ ] 确认基线 `20261014000000_postgresql_init` 状态正常；判断 `20261020152832_add_project_diaries` 是待执行还是已执行，不能重复导入或清理已有表。
- [ ] 对照 migration SQL 检查实际表、列、唯一约束、索引和复合外键；若历史或结构不一致，停止发布，不能 reset、db push 或自动 resolve。
- [ ] 在短暂停写或一致性快照下，记录 User、Account、Session、Diary 数量和逐用户 Diary 数量，生成覆盖 Diary ID、日期、三个正文栏、content、时间戳的受控校验摘要。
- [ ] 核实 Neon 实际可恢复时间窗口，记录发布前恢复点 T0。恢复能力受实际配置约束，不假定无限历史保留。[Neon 恢复说明](https://neon.com/docs/postgres/backup-restore/branch-restore)
- [ ] 使用受控凭据制作 PostgreSQL 自定义格式备份，存入加密、限制访问的仓库外位置，记录校验和。不得把包含认证数据的备份提交到 Git。
- [ ] 从 T0 创建独立恢复分支/数据库，或将备份恢复到独立目标；不直接覆盖生产。比较数量、ID、日期和正文摘要，并验证两位用户认证与隔离，记录演练耗时和可接受数据损失窗口。
- [ ] 在隔离目标演练 migration 和待发布应用，保留不含敏感数据的结果。

阶段 5A 没有执行以上生产操作，也没有实测当前 Neon 的备份恢复能力。增量 SQL 与恢复细节见 [project-diary-migration.md](project-diary-migration.md)。SQLite 导出/导入脚本是历史演练工具，不用于本次 Neon 增量发布；不得将现有生产数据再次导入空库或切换到未确认数据库。

## 4. 发布门禁与先后顺序

只有阶段 5A 审核通过并另行获得生产发布授权后，才执行下列步骤：

1. 冻结目标完整 SHA，确认本地状态干净及全部验证通过。
2. 先在 Render 核实并关闭关联分支的自动部署，确认无排队的待发布任务；记录旧 live commit、环境配置和可用回滚制品。这是未来发布操作，本阶段未更改开关。
3. 在批准的 GitHub 发布流程中同步审核过的 commit，等待该 SHA 的 CI 全绿。push 也需要单独授权，不能只依据本地提交已完成便执行。
4. 核对 Neon 历史、DDL、备份及演练结果；确定是否确有待应用 migration。
5. 若有待执行迁移，通过唯一受审批的执行入口，在直连凭据环境中运行 `pnpm db:migrate:deploy`。若已应用则跳过，不能重放历史 SQL。禁止生产 `migrate dev`、`db push`、`migrate reset`。
6. 检查 migration 状态和实际约束，比较旧数据数量、ID 与摘要；验证原应用仍可工作。首次增量新表应为空，若表已有数据则先查明来源并保留，不得清空。
7. 执行 `pnpm check:deployment`。它检查必需变量、Client 和 migration 状态，不替代备份、Schema 漂移检查或业务验收。
8. 人工发布相同 SHA 到 Render，确认实际 live commit 一致。
9. 完成第 7 节验收后才结束发布观察；是否重新启用自动部署另行决定，不能自动恢复开关。

数据库应先扩展，应用后发布。本次 migration 只新增 ProjectStatus、Project、ProjectDiary，不变更旧 Diary 和 Better Auth 表，旧应用可继续使用原结构。

## 5. Render 构建、启动及工作流

以下是建议配置，不能视为已核对当前生产设置：

- Node.js 按 `.nvmrc` 固定版本；pnpm 为 `package.json` 指定的 `10.34.6`。
- 安装使用 `pnpm install --frozen-lockfile`，postinstall 会执行 `prisma generate`，构建使用 `pnpm build`。
- 启动使用 `pnpm start`，确认 Next.js 实际监听 Render 的 `PORT` 及 `0.0.0.0`；不要硬编码本机端口。
- 健康检查路径 `/api/health`；只返回数据库可用状态，不读取业务数据或输出错误连接详情。
- 四个受控环境变量为 DATABASE_URL、DIRECT_URL、BETTER_AUTH_SECRET、BETTER_AUTH_URL；保留现有认证密钥与正式 Origin，避免无意使 Session 失效。
- 构建和启动命令都不执行 migration。Render Free 不应被假定具备付费服务的 pre-deploy command；迁移通过独立审批入口执行。[Render 部署能力](https://render.com/docs/deploys)

`.github/workflows/ci.yml` 在 push/PR 时检查临时 PostgreSQL、lint、测试和 build，不负责生产迁移或 Render 发布。`.github/workflows/migrate.yml` 仅为手动 `workflow_dispatch` 的 `staging` 工作流，Secret 的实际目标未核实；不能用它假装 production 发布步骤，也不能把生产 Secret 填入 staging。

## 6. 发布失败与回滚

- 备份或恢复演练未通过：不执行 migration 或应用发布。
- migration 失败：停止应用发布，记录失败步骤，核对部分已执行 DDL 和 migration 状态；不得 reset、删表或盲目修改 migration 记录。恢复/前向修复方案需重新审核。
- 数据库迁移成功、应用失败：优先保持新增表和历史记录，回滚到事先确认可用的 Render deploy/旧 SHA，不执行向下删表迁移。
- 回滚前核对可用构建制品以及环境变量、构建命令、Origin 是否匹配。Render 的回滚制品保留有限，Free 仅支持最近两个先前部署，不能假设任意旧 SHA 都有现成制品。[Render Free 限制](https://render.com/docs/free)
- Render Dashboard 回滚会关闭自动部署，API 回滚不会；发布操作者仍需核实实际开关，防止后续 push 再次部署故障版本。[Render 回滚说明](https://render.com/docs/rollbacks)
- 若发生数据损坏，在受控停写窗口恢复到独立副本并完成一致性和双用户验证，再审批流量/连接切换；评估 T0 之后的新写入，不能通过恢复旧快照无声丢弃这些数据。
- 应用回滚不会自动恢复数据库，Neon 恢复也不会自动回滚 Render。新增项目日志在应用回滚后可能暂时不可见，应保留等待修复版恢复访问。

## 7. 发布后业务验收清单

仅在获准的发布阶段使用两个专用验收账号，不查询其他真实用户数据：

- [ ] `/api/health` 返回 200，live commit 为目标 SHA，错误日志没有连接信息或密钥。
- [ ] 注册两位用户、登录、刷新保持 Session、退出失效、重新登录成功。
- [ ] 原 Diary 创建/编辑仍是同用户同日一篇；History、详情、Search、Settings 和时区边界正确。
- [ ] 项目创建、重名、编辑、三种状态、归档恢复均正常。
- [ ] 同项目同一天创建 3 篇不同 ID 的 ProjectDiary，跨项目不串数据。
- [ ] 项目日志查看、编辑单篇、补写历史日期、日期与四栏关键词组合筛选、分页正确。
- [ ] 归档项目可读、不可新增或编辑；恢复后可写，原数据一致；并发保护先在隔离环境验证，生产只做受控业务冒烟。
- [ ] Dashboard 保留今日/最近 Diary；项目最多 3 个，计数、最近日期、无日志回退和归档排除正确。
- [ ] 用户 A 不能访问/修改用户 B 的项目及日志；同用户日志与错误项目 ID 组合返回 404；匿名 API 返回 401。
- [ ] 记录验收数据的归属、结果和异常，不为了清理测试而删除真实用户或重置数据库。

## 8. Render Free 与查询风险

- Free 实例空闲后会休眠，下一次访问存在冷启动延迟；Neon 计算唤醒还可能增加数据库首请求耗时。区分冷启动与热请求，不将冷启动一律诊断为业务故障。[Render Free](https://render.com/docs/free)
- 实例 CPU、内存、流量、构建额度及数据库连接预算应在实际控制台核实；没有进行生产负载测试，不承诺并发容量或响应时间。
- Dashboard 项目区域单次聚合，只返回 3 行；没有 N+1，不读项目描述和日志正文。准确计数和 MAX 日期仍需处理该用户未归档项目的日志行，数据增长后应在隔离环境使用 EXPLAIN 分析，不把 LIMIT 3 误写成“只扫描 3 行”。
- 项目日志列表最多获取 21 行用于 20 条分页；关键词包含搜索、大页码偏移及旧 Diary/项目全部列表仍可能在大数据量下变慢。阶段 5A 没有改这些业务规则，发布前用代表性隔离数据测量。
- 归档与写入在单项目行锁上串行，数据库连接和事务等待需观察；超时应失败回滚，不通过跳过归档检查提高吞吐。
- 使用现有 Prisma Client 复用与 Neon 应用连接池，合理核实实际连接预算，不因本地通过就提高生产连接数。
- Render 文件系统不是持久数据备份；不要把数据库、用户附件或恢复备份存入临时实例目录。

## 9. 手机浏览器人工验收（待执行）

- [ ] iOS Safari / Android Chrome，窄屏与横竖屏，无水平溢出；长项目名、标题和正文正常换行。
- [ ] Dashboard 今日 Diary、最近 Diary、我的科研项目依次清晰，项目卡片与全部/创建入口可点。
- [ ] 登录、注册、退出、Session 过期提示和回到登录页面可用。
- [ ] 新建/编辑 ProjectDiary 时日期控件可修改历史日期，输入法与软键盘不遮挡保存反馈。
- [ ] 同一天 3 篇日志独立显示，编辑只影响选中日志，返回所属项目正确。
- [ ] 日期筛选、关键词输入、清除与翻页保留筛选条件；空结果文案正确。
- [ ] 归档后不显示可操作的日志新增/编辑入口，直接访问只读；恢复后入口恢复。
- [ ] 弱网、保存失败、重复点击、冷启动及页面刷新有可理解反馈，不把失败误报为成功。

## 10. 本阶段结论边界

Render + Neon 是维护者提供的真实部署背景；公开平台文档只用于核对平台能力，不能证明该应用的实际开关、套餐、备份或部署 SHA。上述生产核对、恢复演练、手机人工验收与线上冒烟均未在阶段 5A 执行。
