import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProjectArchiveButton } from "@/components/project-archive-button";
import { getProjectDiaries, ProjectDiaryError } from "@/features/project/project-diary-service";
import { PROJECT_DIARY_MAX_PAGE } from "@/features/project/project-diary-types";
import { getProjectById } from "@/features/project/project-service";
import { projectStatusLabels } from "@/features/project/types";
import { getCurrentUser } from "@/lib/current-user";

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const project = await getProjectById(user.id, id);
  if (!project) notFound();
  const search = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const date = first(search.date) ?? "";
  const q = first(search.q) ?? "";
  let result;
  let filterError = "";
  try { result = await getProjectDiaries(user.id, id, { date, q, page: first(search.page) }); }
  catch (error) {
    if (error instanceof ProjectDiaryError && error.status === 404) notFound();
    if (!(error instanceof ProjectDiaryError) || error.status !== 400) throw error;
    filterError = error.message;
  }
  function pageHref(page: number) {
    const query = new URLSearchParams({ page: String(page) });
    if (date) query.set("date", date);
    if (q) query.set("q", q);
    return `/projects/${id}?${query}`;
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:py-16">
      <Link className="text-sm text-slate-600 hover:text-slate-950" href={project.archivedAt ? "/projects?archived=true" : "/projects"}>← 返回项目列表</Link>
      <article className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <p className="text-sm text-slate-500">{projectStatusLabels[project.status]}{project.archivedAt ? " · 已归档" : ""}</p>
        <h1 className="mt-3 break-words text-3xl font-semibold tracking-tight">{project.name}</h1>
        <h2 className="mt-8 text-sm font-semibold text-slate-800">项目描述</h2>
        <p className="mt-3 break-words whitespace-pre-wrap leading-7 text-slate-700">{project.description || "暂无描述"}</p>
        {project.archivedAt ? <p className="mt-6 text-sm text-slate-500">项目已归档，已有日志会保留。恢复后项目将重新显示在未归档列表。</p> : null}
        <div className="mt-8 flex flex-wrap items-start gap-4">
          <Link className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-700" href={`/projects/${project.id}/edit`}>编辑项目</Link>
          <ProjectArchiveButton archived={Boolean(project.archivedAt)} id={project.id} />
        </div>
      </article>
      <section aria-label="项目日志" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">项目日志</h2>
          {!project.archivedAt ? <Link className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white" href={`/projects/${id}/diaries/new`}>新建日志</Link> : <p className="text-sm text-slate-600">项目已归档，历史日志只读。</p>}
        </div>
        <form action={`/projects/${id}`} className="mt-6 flex flex-wrap items-end gap-3" method="get">
          <label className="min-w-0 flex-1 basis-48 text-sm text-slate-700">关键词
            <input className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3" defaultValue={q} maxLength={200} name="q" placeholder="搜索标题和三个正文栏" type="search" />
          </label>
          <label className="text-sm text-slate-700">日志日期
            <input className="mt-2 block rounded-lg border border-slate-300 bg-white px-3 py-3" defaultValue={date} max="9999-12-31" min="0001-01-01" name="date" type="date" />
          </label>
          <button className="rounded-lg bg-slate-900 px-5 py-3 text-sm text-white" type="submit">筛选日志</button>
          <Link className="px-2 py-3 text-sm text-slate-600" href={`/projects/${id}`}>清除筛选</Link>
        </form>
        {filterError ? <p className="mt-6 text-red-600" role="alert">{filterError}</p> : result?.diaries.length ? (
          <div className="mt-6 space-y-4">
            {result.diaries.map((diary) => (
              <Link className="block rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-400" href={`/projects/${id}/diaries/${diary.id}`} key={diary.id}>
                <time className="text-sm text-slate-500" dateTime={diary.entryDate}>{diary.entryDate}</time>
                <h3 className="mt-2 break-words text-lg font-semibold">{diary.title}</h3>
                <p className="mt-3 line-clamp-2 break-words whitespace-pre-wrap text-sm text-slate-600">{diary.completedTasks.trim() || "未填写完成事项"}</p>
              </Link>
            ))}
          </div>
        ) : <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">{q || date ? "没有符合条件的项目日志。" : "暂无项目日志。"}</p>}
        {result ? <nav aria-label="项目日志分页" className="mt-6 flex flex-wrap items-center gap-5 text-sm">
          {result.page > 1 ? <Link href={pageHref(result.page - 1)}>上一页</Link> : null}
          <span className="text-slate-500">第 {result.page} 页</span>
          {result.hasNext ? <Link href={pageHref(result.page + 1)}>下一页</Link> : null}
          {result.page === PROJECT_DIARY_MAX_PAGE ? <span className="text-slate-500">请缩小日期或关键词范围继续查看。</span> : null}
        </nav> : null}
      </section>
    </main>
  );
}
