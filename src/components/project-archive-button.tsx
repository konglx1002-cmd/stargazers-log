"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function toggleArchive() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !archived }),
      });
      if (!response.ok) {
        const result = await response.json();
        setMessage(result.message ?? "更新归档状态失败");
        return;
      }
      router.refresh();
    } catch {
      setMessage("更新归档状态失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button
        className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:border-slate-500 disabled:opacity-60"
        disabled={saving}
        onClick={toggleArchive}
        type="button"
      >
        {saving ? "更新中…" : archived ? "恢复归档" : "归档项目"}
      </button>
      <p aria-live="polite" className="mt-2 text-sm text-red-600">{message}</p>
    </div>
  );
}
