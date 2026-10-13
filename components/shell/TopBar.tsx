"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { KICK_URL } from "@/lib/constants";
import { AccountButton } from "./AccountButton";

// Admin reaches /login by URL. The chrome shows search, the Kick live pill
// (streamer status, from the cached read), a sign-up CTA that jumps to the
// partner-casino section on the home page, and the viewer account button.
export function TopBar({ live, viewers }: { live: boolean; viewers: number | null }) {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  function openPalette() {
    window.dispatchEvent(new Event("odt:open-palette"));
  }
  function openMenu() {
    window.dispatchEvent(new Event("odt:open-menu"));
  }

  return (
    <header className="app-topbar fixed inset-x-0 top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-bg-0/80 px-3 backdrop-blur-md sm:gap-3 sm:px-4">
      {/* mobile hamburger — opens the nav menu */}
      <button
        onClick={openMenu}
        className="press grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-bg-1 text-text-1 hover:text-text-0 lg:hidden"
        aria-label="Open menu"
      >
        <Icon name="Menu" className="h-5 w-5" />
      </button>
      <button
        onClick={openPalette}
        className="press flex h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 text-text-2 hover:border-line-strong md:max-w-sm"
        aria-label="Search (open command palette)"
      >
        <Icon name="Search" className="h-4 w-4" />
        <span className="text-sm">Search or jump to…</span>
        <kbd className="ml-auto hidden rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-text-2 sm:block">
          {mac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <a
          href={KICK_URL}
          target="_blank"
          rel="noreferrer"
          className="hidden items-center gap-2 rounded-full border border-line bg-bg-1 px-3 py-1.5 text-xs sm:flex"
        >
          <span className="relative flex h-2 w-2">
            {live && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-60" />
            )}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-volt" : "bg-text-2"}`} />
          </span>
          {live ? (
            <span className="font-medium text-volt">
              LIVE{viewers != null ? ` · ${viewers.toLocaleString()}` : ""}
            </span>
          ) : (
            <span className="text-text-2">Offline</span>
          )}
        </a>

        <Link
          href="/#play"
          className="press inline-flex h-10 items-center gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-bg-0 hover:bg-gold-hi"
        >
          <Icon name="Zap" className="h-4 w-4" />
          <span className="hidden sm:inline">Sign up &amp; play</span>
          <span className="sm:hidden">Play</span>
        </Link>
        <AccountButton />
      </div>
    </header>
  );
}
