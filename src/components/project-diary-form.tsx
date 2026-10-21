"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  PROJECT_DIARY_BODY_MAX_LENGTH,
  PROJECT_DIARY_TITLE_MAX_LENGTH,
  validateProjectDiaryFields,
  type ProjectDiaryData,
  type ProjectDiaryInput,
} from "@/features/project/project-diary-types";

export function ProjectDiaryForm({ projectId, defaultDate, diary }: { projectId: string; defaultDate: string; diary?: ProjectDiaryData }) {
  const router = useRouter();
  const [input, setInput] = useState<ProjectDiaryInput>({ title: diary?.title ?? "", entryDate: diary?.entryDate ?? defaultDate, completedTasks: diary?.completedTasks ?? "", problems: diary?.problems ?? "", nextPlan: diary?.nextPlan ?? "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const projectPath = `/projects/${projectId}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateProjectDiaryFields(input);
    setFailed(Boolean(error));
    if (error) { setMessage(error); return; }
    setSaving(true);
    setMessage("正在保存…");
    try {
      const response = await fetch(`/api/projects/${projectId}/diaries${diary ? `/${diary.id}` : ""}`, {
        method: diary ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result: { diary?: ProjectDiaryData; message?: string } = await response.json();
      if (!response.ok || !result.diary) {
        setFailed(true);
        setMessage(result.message ?? "保存失败，请重试");
        return;
      }
      setMessage("日志保存成功");
      router.push(`${projectPath}/diaries/${result.diary.id}?saved=1`);
      router.refresh();
    } catch {
      setFailed(true);
      setMessage("保存失败，请稍后重试");
    } finally { setSaving(false); }
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={submit}>
      <fieldset className="space-y-6" disabled={saving}>
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">日志标题</span>
          <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3" maxLength={PROJECT_DIARY_TITLE_MAX_LENGTH} name="title" onChange={(event) => setInput({ ...input, title: event.target.value })} required value={input.title} />
          <span className="mt-2 block text-xs text-slate-500">最多 {PROJECT_DIARY_TITLE_MAX_LENGTH} 字</span>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">日志日期</span>
          <input className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3" max="9999-12-31" min="0001-01-01" name="entryDate" onChange={(event) => setInput({ ...input, entryDate: event.target.value })} required type="date" value={input.entryDate} />
          <span className="mt-2 block text-xs text-slate-500">可补写历史日期；同一天可创建多篇独立日志</span>
        </label>
        {([ ["completedTasks", "完成事项"], ["problems", "遇到问题"], ["nextPlan", "下一步计划"] ] as const).map(([field, label]) => (
          <label className="block" key={field}>
            <span className="text-sm font-semibold text-slate-800">{label}</span>
            <textarea className="mt-2 min-h-36 w-full rounded-xl border border-slate-300 bg-white p-4 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200" maxLength={PROJECT_DIARY_BODY_MAX_LENGTH} name={field} onChange={(event) => setInput({ ...input, [field]: event.target.value })} value={input[field]} />
            <span className="mt-2 block text-xs text-slate-500">最多 {PROJECT_DIARY_BODY_MAX_LENGTH} 字</span>
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-4">
          <button className="rounded-lg bg-slate-900 px-6 py-3 font-medium text-white hover:bg-slate-700 disabled:opacity-60" type="submit">{saving ? "保存中…" : diary ? "保存修改" : "创建日志"}</button>
          <Link className="text-sm text-slate-600" href={diary ? `${projectPath}/diaries/${diary.id}` : projectPath}>取消</Link>
        </div>
      </fieldset>
      <p aria-live="polite" className={failed ? "text-sm text-red-600" : "text-sm text-emerald-700"}>{message}</p>
    </form>
  );
}
