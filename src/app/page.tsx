import Link from "next/link";

import { AppNavigation } from "@/components/app-navigation";
import { getRecentDiaries, getTodayDiary } from "@/features/diary/diary-service";
import { formatDiaryDate } from "@/features/diary/format";
import { getDashboardProjects } from "@/features/project/project-service";
import { projectStatusLabels } from "@/features/project/types";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

function PublicHome() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-16">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-500">个人成长记录工具</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">科研成长日志</h1>
        <p className="mt-4 max-w-xl text-slate-600">
          记录每日科研、学习与工程实践，沉淀长期成长轨迹。
        </p>
        <AppNavigation />
      </div>
    </main>
  );
}

const shortcuts = [
  { href: "/history", label: "历史日志", description: "回顾过去的科研记录" },
  { href: "/search", label: "搜索日志", description: "按关键词查找历史内容" },
  { href: "/settings", label: "设置", description: "修改用户名和个人时区" },
];

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return <PublicHome />;
  }

  const [today, recentDiaries, recentProjects] = await Promise.all([
    getTodayDiary(user.id, user.timeZone),
    getRecentDiaries(user.id),
    getDashboardProjects(user.id),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 sm:py-16">
      <header>
        <time className="text-sm font-medium text-slate-500" dateTime={today.date}>
          {formatDiaryDate(today.date)}
        </time>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">你好，{user.name}</h1>
        <p className="mt-3 text-slate-600">这是你的科研日志工作台。</p>
      </header>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <p className="text-sm font-medium text-slate-500">今日状态</p>
        <h2 className="mt-2 text-2xl font-semibold">
          {today.diary ? "今天已经完成日志" : "还没有记录今天的日志"}
        </h2>
        <Link
          className="mt-6 inline-flex rounded-lg bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-700"
          href="/diary"
        >
          {today.diary ? "继续编辑今天日志" : "记录今天"}
        </Link>
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">成长轨迹</p>
            <h2 className="mt-2 text-2xl font-semibold">最近日志</h2>
          </div>
          {recentDiaries.length > 0 ? (
            <Link className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/history">
              查看全部
            </Link>
          ) : null}
        </div>

        {recentDiaries.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-slate-700">开始你的第一篇科研日志</p>
            <Link
              className="mt-5 inline-flex rounded-lg bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-700"
              href="/diary"
            >
              记录今天
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {recentDiaries.map((diary) => (
              <Link
                className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-400 hover:shadow-sm"
                href={`/diary/${diary.id}`}
                key={diary.id}
              >
                <time className="text-sm font-semibold text-slate-900" dateTime={diary.date}>
                  {formatDiaryDate(diary.date)}
                </time>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
                  {diary.completedTasks.trim() || "未填写完成事项"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section aria-label="我的科研项目" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold">我的科研项目</h2>
          <Link className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/projects">全部科研项目</Link>
        </div>
        {recentProjects.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-slate-700">暂无未归档的科研项目，创建你的第一个项目吧。</p>
            <Link className="mt-5 inline-flex rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-700" href="/projects/new">创建科研项目</Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {recentProjects.map((project) => (
              <Link className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-400 hover:shadow-sm" href={`/projects/${project.id}`} key={project.id}>
                <p className="text-sm text-slate-500">{projectStatusLabels[project.status]}</p>
                <h3 className="mt-3 break-words text-lg font-semibold text-slate-900">{project.name}</h3>
                <p className="mt-4 text-sm text-slate-600">项目日志：{project.diaryCount} 篇</p>
                <p className="mt-2 text-sm text-slate-600">最近日志：{project.lastEntryDate ? <time dateTime={project.lastEntryDate}>{formatDiaryDate(project.lastEntryDate)}</time> : "暂无日志"}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <p className="text-sm font-medium text-slate-500">快捷入口</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {shortcuts.map((shortcut) => (
            <Link
              className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-400"
              href={shortcut.href}
              key={shortcut.href}
            >
              <h2 className="font-semibold text-slate-900">{shortcut.label}</h2>
              <p className="mt-2 text-sm text-slate-600">{shortcut.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
