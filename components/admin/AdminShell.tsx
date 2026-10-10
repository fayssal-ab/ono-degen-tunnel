"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { BRAND_NAME } from "@/lib/constants";

// Admin chrome. Built sections link; not-yet-built ones are shown disabled with
// a "soon" tag (not dead buttons) so you can see the full shape of the panel.
const BUILT = [
  { label: "Dashboard", href: "/admin", icon: "LayoutDashboard" },
  { label: "Periods", href: "/admin/periods", icon: "CalendarRange" },
  { label: "Giveaways", href: "/admin/giveaways", icon: "Gift" },
  { label: "VIP Tiers", href: "/admin/vip", icon: "Crown" },
  { label: "Stream Schedule", href: "/admin/stream", icon: "Radio" },
  { label: "Audit Log", href: "/admin/audit", icon: "ScrollText" },
  { label: "Settings", href: "/admin/settings", icon: "Settings" },
];
const SOON = [
  { label: "Races", icon: "Flag" },
  { label: "Tournaments", icon: "Swords" },
  { label: "Challenges", icon: "Target" },
  { label: "Bonus Hunt", icon: "Dices" },
  { label: "Guess the Balance", icon: "Gauge" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="hidden flex-col border-r border-line bg-bg-1 lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-line px-5">
          <Icon name="ShieldCheck" className="h-5 w-5 text-gold" />
          <span className="font-display text-sm font-bold">Control room</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <p className="label px-2 pb-2">Manage</p>
          <ul className="space-y-0.5">
            {BUILT.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${
                      active ? "bg-bg-3 text-text-0" : "text-text-1 hover:bg-bg-2 hover:text-text-0"
                    }`}
                  >
                    <Icon name={item.icon} className={`h-[18px] w-[18px] ${active ? "text-gold" : ""}`} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            {SOON.map((item) => (
              <li
                key={item.label}
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-text-2/60"
                title="Being built"
              >
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
                <span>{item.label}</span>
                <span className="ml-auto rounded-full border border-line px-1.5 text-[10px] uppercase tracking-wider">soon</span>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-line px-4 md:px-6">
          <span className="font-display text-sm font-bold lg:hidden">{BRAND_NAME}</span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/"
              className="press inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm text-text-1 hover:text-text-0"
            >
              <Icon name="ExternalLink" className="h-4 w-4" /> View site
            </Link>
            <button
              onClick={logout}
              className="press inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm text-text-1 hover:border-danger hover:text-danger"
            >
              <Icon name="LogOut" className="h-4 w-4" /> Log out
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:px-6">{children}</main>
      </div>
    </div>
  );
}
