import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProjectDiaryForm } from "@/components/project-diary-form";
import { getProjectDiaryDefaultDate } from "@/features/project/project-diary-service";
import { getProjectById } from "@/features/project/project-service";
import { getCurrentUser } from "@/lib/current-user";

export default async function NewProjectDiaryPage({ params }: PageProps<"/projects/[id]/diaries/new">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const project = await getProjectById(user.id, id);
  if (!project) notFound();
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:py-16">
      <Link className="text-sm text-slate-600" href={`/projects/${id}`}>← 返回所属项目</Link>
      <h1 className="mt-8 text-3xl font-semibold">新建项目日志</h1>
      <p className="mt-3 break-words text-slate-600">{project.name}</p>
      {project.archivedAt ? <p className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-slate-700">项目已归档，仅可查看历史日志。请先恢复归档后再新增或编辑日志。</p> : <ProjectDiaryForm defaultDate={getProjectDiaryDefaultDate(user.timeZone)} projectId={id} />}
    </main>
  );
}
