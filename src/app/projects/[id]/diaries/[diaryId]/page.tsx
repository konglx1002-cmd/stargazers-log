import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getProjectDiaryById, ProjectDiaryError } from "@/features/project/project-diary-service";
import { getProjectById } from "@/features/project/project-service";
import { getCurrentUser } from "@/lib/current-user";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/time-zone";

export default async function ProjectDiaryPage({ params, searchParams }: PageProps<"/projects/[id]/diaries/[diaryId]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id, diaryId } = await params;
  const project = await getProjectById(user.id, id);
  if (!project) notFound();
  let diary;
  try { diary = await getProjectDiaryById(user.id, id, diaryId); }
  catch (error) { if (error instanceof ProjectDiaryError && error.status === 404) notFound(); throw error; }
  const saved = (await searchParams).saved === "1";
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:py-16">
      <Link className="text-sm text-slate-600" href={`/projects/${id}`}>← 返回所属项目</Link>
      {saved ? <p className="mt-6 text-emerald-700" role="status">日志保存成功</p> : null}
      <article className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <p className="break-words text-sm text-slate-500">{project.name}</p>
        <h1 className="mt-3 break-words text-3xl font-semibold">{diary.title}</h1>
        <p className="mt-4 text-sm text-slate-600">日志日期：<time dateTime={diary.entryDate}>{diary.entryDate}</time></p>
        <p className="mt-2 text-xs text-slate-500">创建时间：<time dateTime={diary.createdAt}>{new Intl.DateTimeFormat("zh-CN", { timeZone: isValidTimeZone(user.timeZone) ? user.timeZone : DEFAULT_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(diary.createdAt))}</time></p>
        <div className="mt-8 space-y-8">
          {([ ["completedTasks", "完成事项"], ["problems", "遇到问题"], ["nextPlan", "下一步计划"] ] as const).map(([field, label]) => (
            <section key={field}><h2 className="text-sm font-semibold">{label}</h2><p className="mt-3 break-words whitespace-pre-wrap leading-7 text-slate-700">{diary[field].trim() || "未填写"}</p></section>
          ))}
        </div>
        {project.archivedAt ? <p className="mt-8 text-sm text-slate-600">项目已归档，历史日志只读。恢复归档后可继续编辑。</p> : <Link className="mt-8 inline-flex rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white" href={`/projects/${id}/diaries/${diaryId}/edit`}>编辑日志</Link>}
      </article>
    </main>
  );
}
