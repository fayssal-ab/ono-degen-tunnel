"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { NAV_GROUPS } from "@/lib/nav";
import { BRAND_NAME, KICK_URL, DISCORD_URL } from "@/lib/constants";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";

const STORAGE_KEY = "odt.sidebar.collapsed";

export function Sidebar({ live, hidden = [] }: { live: boolean; hidden?: string[] }) {
  const pathname = usePathname();
  const hiddenSet = new Set(hidden);
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  // The main-content offset is driven from CSS off an <html> class, so the
  // server-rendered layout and the client sidebar stay in sync across the
  // RSC boundary (no prop drilling of a client-only value into a server tree).
  function syncHtml(isCollapsed: boolean) {
    document.documentElement.classList.toggle("sidebar-collapsed", isCollapsed);
  }

  useEffect(() => {
    let initial = false;
    try {
      initial = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* private mode / blocked storage — default expanded */
    }
    setCollapsed(initial);
    syncHtml(initial);
    setReady(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      syncHtml(next);
      return next;
    });
  }

  return (
    <aside
      data-collapsed={collapsed}
      // avoid a flash of the wrong width before localStorage is read
      style={{ visibility: ready ? "visible" : "hidden" }}
      className="group fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-bg-1 lg:flex"
      data-w={collapsed ? "rail" : "full"}
    >
      <div
        className="relative flex h-full flex-col transition-[width] duration-200 ease-[var(--ease-tunnel)]"
        style={{
          width: collapsed ? "var(--sidebar-w-rail)" : "var(--sidebar-w)",
          backgroundImage:
            "linear-gradient(180deg, color-mix(in srgb, var(--color-plasma) 7%, transparent) 0%, transparent 26%)",
        }}
      >
        {/* neon right edge */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-px"
          style={{ background: "linear-gradient(180deg, transparent, color-mix(in srgb, var(--color-cyan) 45%, transparent) 45%, transparent)" }}
          aria-hidden
        />
        {/* edge collapse tab */}
        <button
          onClick={toggle}
          className="press absolute -right-3 top-[18px] z-50 grid h-6 w-6 place-items-center rounded-full border border-line-strong bg-bg-2 text-text-1 shadow-lg transition-colors hover:border-volt hover:text-volt"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon name={collapsed ? "ChevronRight" : "ChevronLeft"} className="h-3.5 w-3.5" />
        </button>

        {/* brand */}
        <div className={`flex h-16 items-center border-b border-line ${collapsed ? "justify-center px-2" : "gap-3 px-4"}`}>
          <Link href="/" className="flex items-center gap-3 overflow-hidden" title={BRAND_NAME}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LOGO/logo-128.webp" alt="" width={40} height={37} className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_0_12px_rgba(245,196,81,0.4)]" />
            {!collapsed && <span className="font-bang text-gradient-gold truncate text-base tracking-wide">{BRAND_NAME}</span>}
          </Link>
        </div>

        {/* nav groups */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((i) => !hiddenSet.has(i.href));
            if (items.length === 0) return null;
            return (
            <div key={group.title} className="mb-5">
              {!collapsed && <p className="label px-2 pb-2">{group.title}</p>}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={`group relative flex items-center gap-3 rounded-lg py-2 text-sm transition-colors ${
                          collapsed ? "justify-center px-0" : "px-2"
                        } ${active ? "text-text-0" : "text-text-1 hover:bg-bg-2 hover:text-text-0"}`}
                      >
                        {active && (
                          <motion.span
                            layoutId="sb-active"
                            className="absolute inset-0 z-0 rounded-lg border border-volt/20 bg-gradient-to-r from-volt/15 via-bg-3 to-bg-3 shadow-[0_0_20px_-14px_var(--color-volt)]"
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                          />
                        )}
                        {active && (
                          <span className="absolute left-0 top-1/2 z-10 h-5 w-[3px] -translate-y-1/2 rounded-full bg-volt shadow-[0_0_8px_var(--color-volt)]" />
                        )}
                        <Icon
                          name={item.icon}
                          className={`relative z-10 h-[18px] w-[18px] shrink-0 transition-colors ${active ? "text-volt" : "group-hover:text-text-0"}`}
                        />
                        {!collapsed && <span className="relative z-10 truncate font-display text-[13px] tracking-wide">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })}
        </nav>

        {/* footer: kick live + discord */}
        <div className="space-y-2 border-t border-line p-3">
          <a
            href={KICK_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-bg-2"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {live && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-60" />
              )}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? "bg-volt" : "bg-text-2"}`} />
            </span>
            {!collapsed && (
              <span className="truncate text-text-1">
                {live ? "LIVE on Kick" : "Offline on Kick"}
              </span>
            )}
          </a>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-text-1 hover:bg-bg-2 hover:text-text-0"
          >
            <BrandIcon brand="discord" className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">Discord</span>}
          </a>
        </div>
      </div>
    </aside>
  );
}
