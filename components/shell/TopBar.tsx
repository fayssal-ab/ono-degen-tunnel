"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { KICK_URL } from "@/lib/constants";

// No login button: admin reaches /login by URL. The chrome shows search, the
// Kick live pill (streamer status, from the cached read), and a sign-up CTA
// that jumps to the partner-casino section on the home page.
export function TopBar({ live, viewers }: { live: boolean; viewers: number | null }) {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  function openPalette() {
    window.dispatchEvent(new Event("odt:open-palette"));
  }

  return (
    <header className="app-topbar fixed inset-x-0 top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg-0/80 px-4 backdrop-blur-md">
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
      </div>
    </header>
  );
}
