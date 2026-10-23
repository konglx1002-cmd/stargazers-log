import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProjectForm } from "@/components/project-form";
import { getProjectById } from "@/features/project/project-service";
import { getCurrentUser } from "@/lib/current-user";

export default async function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const project = await getProjectById(user.id, id);
  if (!project) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:py-16">
      <Link className="text-sm text-slate-600 hover:text-slate-950" href={`/projects/${project.id}`}>← 返回项目详情</Link>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">编辑科研项目</h1>
      <ProjectForm project={project} />
    </main>
  );
}
