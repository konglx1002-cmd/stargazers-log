import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProjectDiaryForm } from "@/components/project-diary-form";
import { getProjectDiaryById, ProjectDiaryError } from "@/features/project/project-diary-service";
import { getProjectById } from "@/features/project/project-service";
import { getCurrentUser } from "@/lib/current-user";

export default async function EditProjectDiaryPage({ params }: PageProps<"/projects/[id]/diaries/[diaryId]/edit">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id, diaryId } = await params;
  const project = await getProjectById(user.id, id);
  if (!project) notFound();
  let diary;
  try { diary = await getProjectDiaryById(user.id, id, diaryId); }
  catch (error) { if (error instanceof ProjectDiaryError && error.status === 404) notFound(); throw error; }
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:py-16">
      <Link className="text-sm text-slate-600" href={`/projects/${id}`}>← 返回所属项目</Link>
      <h1 className="mt-8 text-3xl font-semibold">编辑项目日志</h1>
      {project.archivedAt ? <p className="mt-8 rounded-xl border border-slate-200 bg-white p-6">项目已归档，历史日志只读。请先恢复归档后再编辑。</p> : <ProjectDiaryForm defaultDate={diary.entryDate} diary={diary} projectId={id} />}
    </main>
  );
}
