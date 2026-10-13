"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { CustomCursor } from "@/components/shell/CustomCursor";
import { BRAND_NAME } from "@/lib/constants";

// Admin chrome: grouped sections; on small screens the same list opens as a
// drawer from the header (the sidebar is desktop-only).
const SECTIONS = [
  { label: "Overview", items: [
    { label: "Dashboard", href: "/admin", icon: "LayoutDashboard" },
  ] },
  { label: "Compete", items: [
    { label: "Periods", href: "/admin/periods", icon: "CalendarRange" },
    { label: "Races", href: "/admin/races", icon: "Flag" },
    { label: "Tournaments", href: "/admin/tournaments", icon: "Swords" },
    { label: "Challenges", href: "/admin/challenges", icon: "Target" },
  ] },
  { label: "Stream", items: [
    { label: "Bonus Hunt", href: "/admin/bonus-hunt", icon: "Dices" },
    { label: "Guess the Balance", href: "/admin/guess-the-balance", icon: "Gauge" },
    { label: "Giveaways", href: "/admin/giveaways", icon: "Gift" },
    { label: "Stream Schedule", href: "/admin/stream", icon: "Radio" },
  ] },
  { label: "Site", items: [
    { label: "Prizes", href: "/admin/prizes", icon: "BadgeDollarSign" },
    { label: "Slot catalogue", href: "/admin/slots", icon: "Library" },
    { label: "VIP Tiers", href: "/admin/vip", icon: "Crown" },
    { label: "Audit Log", href: "/admin/audit", icon: "ScrollText" },
    { label: "Settings", href: "/admin/settings", icon: "Settings" },
  ] },
];

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {SECTIONS.map((section) => (
        <div key={section.label} className="mb-3">
          <p className="label px-2 pb-1.5">{section.label}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
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
          </ul>
        </div>
      ))}
    </>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <CustomCursor />
      <aside className="hidden flex-col border-r border-line bg-bg-1 lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-line px-5">
          <Icon name="ShieldCheck" className="h-5 w-5 text-gold" />
          <span className="font-display text-sm font-bold">Control room</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Admin">
          <NavList pathname={pathname} />
        </nav>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-line px-4 md:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-nav"
            className="press inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm text-text-1 lg:hidden"
          >
            <Icon name={menuOpen ? "X" : "Menu"} className="h-4 w-4" /> Menu
          </button>
          <span className="hidden truncate font-display text-sm font-bold sm:inline lg:hidden">{BRAND_NAME}</span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/"
              aria-label="View site"
              className="press inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm text-text-1 hover:text-text-0"
            >
              <Icon name="ExternalLink" className="h-4 w-4" /> <span className="hidden sm:inline">View site</span>
            </Link>
            <button
              onClick={logout}
              aria-label="Log out"
              className="press inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm text-text-1 hover:border-danger hover:text-danger"
            >
              <Icon name="LogOut" className="h-4 w-4" /> <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </header>
        {menuOpen && (
          <nav id="admin-mobile-nav" aria-label="Admin" className="border-b border-line bg-bg-1 p-3 lg:hidden">
            <NavList pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          </nav>
        )}
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:px-6">{children}</main>
      </div>
    </div>
  );
}
