import Link from "next/link";
import { redirect } from "next/navigation";

import { getProjects } from "@/features/project/project-service";
import { projectStatusLabels } from "@/features/project/types";
import { getCurrentUser } from "@/lib/current-user";

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const archived = (await searchParams).archived === "true";
  const projects = await getProjects(user.id, archived);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 sm:py-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">项目管理</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{archived ? "已归档项目" : "科研项目"}</h1>
        </div>
        <Link className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-700" href="/projects/new">创建项目</Link>
      </header>
      <nav aria-label="项目范围" className="mt-8 flex gap-6 text-sm">
        <Link aria-current={!archived ? "page" : undefined} className={!archived ? "font-semibold text-slate-950" : "text-slate-600"} href="/projects">未归档</Link>
        <Link aria-current={archived ? "page" : undefined} className={archived ? "font-semibold text-slate-950" : "text-slate-600"} href="/projects?archived=true">已归档</Link>
      </nav>
      {projects.length ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <Link className="min-w-0 rounded-xl border border-slate-200 bg-white p-6 transition hover:border-slate-400 hover:shadow-sm" href={`/projects/${project.id}`} key={project.id}>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{projectStatusLabels[project.status]}</span>
              <h2 className="mt-4 break-words text-xl font-semibold">{project.name}</h2>
              <p className="mt-3 line-clamp-3 break-words whitespace-pre-wrap text-sm leading-6 text-slate-600">{project.description || "暂无描述"}</p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">{archived ? "暂无已归档项目。" : "暂无科研项目，创建你的第一个项目吧。"}</p>
      )}
    </main>
  );
}
