import Link from "next/link";

import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser } from "@/lib/current-user";

const links = [
  { href: "/diary", label: "今日记录" },
  { href: "/history", label: "历史记录" },
  { href: "/search", label: "搜索" },
  { href: "/projects", label: "科研项目" },
];

export async function AuthNavigation() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav
        aria-label="全局导航"
        className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4"
      >
        <div className="flex flex-wrap items-center gap-5">
          <Link className="font-semibold text-slate-950" href="/">
            科研成长日志
          </Link>
          {links.map((link) => (
            <Link
              className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {user ? (
          <div className="flex items-center gap-4">
            <Link className="text-sm text-slate-700 hover:text-slate-950" href="/settings">
              {user.name}
            </Link>
            <LogoutButton />
          </div>
        ) : (
          <Link className="text-sm font-medium text-slate-700 hover:text-slate-950" href="/login">
            登录
          </Link>
        )}
      </nav>
    </header>
  );
}
