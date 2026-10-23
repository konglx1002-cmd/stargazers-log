"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  projectStatusLabels,
  type ProjectData,
  type ProjectStatus,
} from "@/features/project/types";

export function ProjectForm({ project }: { project?: ProjectData }) {
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "ACTIVE");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(project ? `/api/projects/${project.id}` : "/api/projects", {
        method: project ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project ? { name, description, status } : { name, description }),
      });
      const result: { project?: ProjectData; message?: string } = await response.json();
      if (!response.ok || !result.project) {
        setMessage(result.message ?? "保存项目失败，请重试");
        return;
      }
      router.push(`/projects/${result.project.id}`);
      router.refresh();
    } catch {
      setMessage("保存项目失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <fieldset className="space-y-6" disabled={saving}>
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">项目名称</span>
          <input
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
            maxLength={PROJECT_NAME_MAX_LENGTH}
            name="name"
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
          <span className="mt-2 block text-xs text-slate-500">最多 {PROJECT_NAME_MAX_LENGTH} 字，允许与已有项目重名</span>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">项目描述</span>
          <textarea
            className="mt-2 min-h-40 w-full rounded-xl border border-slate-300 bg-white p-4 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
            maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
            name="description"
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
          <span className="mt-2 block text-xs text-slate-500">选填，最多 {PROJECT_DESCRIPTION_MAX_LENGTH} 字</span>
        </label>
        {project ? (
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">项目状态</span>
            <select
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
              name="status"
              onChange={(event) => setStatus(event.target.value as ProjectStatus)}
              value={status}
            >
              {Object.entries(projectStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <button className="rounded-lg bg-slate-900 px-6 py-3 font-medium text-white hover:bg-slate-700 disabled:opacity-60" type="submit">
            {saving ? "保存中…" : project ? "保存修改" : "创建项目"}
          </button>
          <Link className="text-sm text-slate-600 hover:text-slate-950" href={project ? `/projects/${project.id}` : "/projects"}>取消</Link>
        </div>
      </fieldset>
      <p aria-live="polite" className="text-sm text-red-600">{message}</p>
    </form>
  );
}
