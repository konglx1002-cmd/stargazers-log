import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProjectArchiveButton } from "@/components/project-archive-button";
import { getProjectById } from "@/features/project/project-service";
import { projectStatusLabels } from "@/features/project/types";
import { getCurrentUser } from "@/lib/current-user";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const project = await getProjectById(user.id, id);
  if (!project) notFound();

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
    </main>
  );
}
