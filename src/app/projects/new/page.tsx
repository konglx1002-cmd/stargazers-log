import Link from "next/link";
import { redirect } from "next/navigation";

import { ProjectForm } from "@/components/project-form";
import { getCurrentUser } from "@/lib/current-user";

export default async function NewProjectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:py-16">
      <Link className="text-sm text-slate-600 hover:text-slate-950" href="/projects">← 返回项目列表</Link>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">创建科研项目</h1>
      <ProjectForm />
    </main>
  );
}
