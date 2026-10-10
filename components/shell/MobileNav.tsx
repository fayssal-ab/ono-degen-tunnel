"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_GROUPS, EXTRA_DESTINATIONS } from "@/lib/nav";
import { BRAND_NAME, KICK_URL, DISCORD_URL } from "@/lib/constants";
import { Icon } from "@/components/ui/Icon";

const TABS = [
  { label: "Home", href: "/", icon: "Home" },
  { label: "Board", href: "/leaderboard", icon: "Trophy" },
  { label: "Play", href: "/bonus-hunt", icon: "Dices" },
  { label: "Rewards", href: "/vip", icon: "Crown" },
] as const;

export function MobileNav({ hidden = [] }: { hidden?: string[] }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const hiddenSet = new Set(hidden);
  const tabs = TABS.filter((t) => !hiddenSet.has(t.href));

  // close the drawer on navigation
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  // lock scroll while the drawer is open
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  return (
    <>
      {/* bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-line bg-bg-1/95 backdrop-blur-md lg:hidden">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] ${
                active ? "text-gold" : "text-text-2"
              }`}
            >
              <Icon name={t.icon} className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
        <button
          onClick={() => setDrawer(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] text-text-2"
          aria-label="Open menu"
        >
          <Icon name="Menu" className="h-5 w-5" />
          Menu
        </button>
      </nav>

      {/* full-screen drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-bg-0/80 backdrop-blur-sm" aria-label="Close" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col border-l border-line bg-bg-1">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <span className="font-display text-sm font-bold">{BRAND_NAME}</span>
              <button
                onClick={() => setDrawer(false)}
                className="press grid h-9 w-9 place-items-center rounded-lg text-text-1 hover:bg-bg-3"
                aria-label="Close menu"
              >
                <Icon name="X" className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              {NAV_GROUPS.map((group) => {
                const items = group.items.filter((i) => !hiddenSet.has(i.href));
                if (items.length === 0) return null;
                return (
                <div key={group.title} className="mb-5">
                  <p className="label px-2 pb-2">{group.title}</p>
                  <ul className="space-y-0.5">
                    {items.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(item.href + "/");
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={`flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm ${
                              active ? "bg-bg-3 text-text-0" : "text-text-1"
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
                );
              })}
              <div className="mb-5">
                <p className="label px-2 pb-2">More</p>
                <ul className="space-y-0.5">
                  {EXTRA_DESTINATIONS.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-text-1">
                        <Icon name={item.icon} className="h-[18px] w-[18px]" />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
              <a href={KICK_URL} target="_blank" rel="noreferrer" className="press flex items-center justify-center gap-2 rounded-xl border border-line-strong py-2.5 text-sm hover:border-volt hover:text-volt">
                <Icon name="Radio" className="h-4 w-4" /> Kick
              </a>
              <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="press flex items-center justify-center gap-2 rounded-xl border border-line-strong py-2.5 text-sm hover:border-plasma hover:text-plasma">
                <Icon name="MessageCircle" className="h-4 w-4" /> Discord
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
