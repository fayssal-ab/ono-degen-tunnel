"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { UserAvatar } from "@/components/ui/UserAvatar";

// Viewer account in the top bar. Read client-side from /api/me so public
// pages stay cacheable; re-read on navigation (sign-in lands on /account).
// Signed in → avatar button opening a menu (profile sections, log out).
type Me = { name: string; avatar: string; providers: ("kick" | "discord")[]; actions: number } | null;

const ITEMS = [
  { href: "/account", label: "My profile", icon: "User" },
  { href: "/account#linked", label: "Linked accounts", icon: "Link" },
  { href: "/account#tournaments", label: "My tournaments", icon: "Swords" },
  { href: "/account#prizes", label: "My prizes", icon: "Gift" },
  { href: "/account#settings", label: "Payout settings", icon: "Settings" },
] as const;

function Avatar({ me, size }: { me: NonNullable<Me>; size: string }) {
  return <UserAvatar src={me.avatar} name={me.name} className={`rounded-lg ${size}`} />;
}

export function AccountButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ user: Me }>)
      .then((d) => { if (alive) { setMe(d.user); setOpen(false); } })
      .catch(() => { if (alive) setMe(null); });
    return () => { alive = false; };
  }, [pathname, tick]);
  // pages that change prize state ask for a re-read (badge count)
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("odt:me", bump);
    return () => window.removeEventListener("odt:me", bump);
  }, []);

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  if (me === undefined) return <span className="h-10 w-10 shrink-0 rounded-xl border border-line bg-bg-1" aria-hidden />;
  if (!me) {
    return (
      <Link href="/account" className="press inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-line-strong bg-bg-1 px-3 text-sm font-semibold text-text-0 hover:border-gold hover:text-gold" aria-label="Log in">
        <Icon name="LogIn" className="h-4 w-4" />
        <span className="hidden md:inline">Log in</span>
      </Link>
    );
  }

  async function logout() {
    setBusy(true);
    try { await fetch("/api/auth/user/logout", { method: "POST" }); } catch { /* cookie cleared server-side when reachable */ }
    setMe(null);
    setOpen(false);
    setBusy(false);
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu (${me.name})`}
        className={`press inline-flex h-10 items-center gap-2 rounded-xl border bg-bg-1 pl-1 pr-1 md:pr-2 ${open ? "border-gold" : "border-line hover:border-gold"}`}
      >
        <span className="relative">
          <Avatar me={me} size="h-8 w-8 text-sm" />
          {me.actions > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white" aria-label={`${me.actions} prize action${me.actions > 1 ? "s" : ""}`}>{me.actions}</span>}
        </span>
        <span className="hidden max-w-[10ch] truncate text-sm font-semibold text-text-0 md:inline">{me.name}</span>
        <Icon name="ChevronDown" className={`hidden h-4 w-4 text-text-2 transition-transform md:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-line-strong bg-bg-1 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-line p-3">
            <Avatar me={me} size="h-11 w-11 text-base" />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-text-0">{me.name}</span>
              <span className="mt-0.5 flex gap-1.5">
                {me.providers.map((p) => (
                  <span key={p} className={`grid h-5 w-5 place-items-center rounded ${p === "kick" ? "bg-[#53fc18]/15 text-[#53fc18]" : "bg-[#5865F2]/20 text-[#8f99ff]"}`} title={p === "kick" ? "Kick linked" : "Discord linked"}>
                    <BrandIcon brand={p} className="h-3 w-3" />
                  </span>
                ))}
              </span>
            </span>
          </div>
          <nav className="p-1.5">
            {ITEMS.map((it) => (
              <Link key={it.href} href={it.href} role="menuitem" onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-1 hover:bg-bg-2 hover:text-text-0">
                <Icon name={it.icon} className="h-4 w-4 text-text-2" /> {it.label}
                {it.icon === "Gift" && me.actions > 0 && <span className="ml-auto rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{me.actions}</span>}
              </Link>
            ))}
            {me.providers.length < 2 && (
              <Link href="/account#linked" role="menuitem" onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gold hover:bg-bg-2">
                <BrandIcon brand={me.providers.includes("kick") ? "discord" : "kick"} className="h-4 w-4" />
                Link {me.providers.includes("kick") ? "Discord" : "Kick"}
              </Link>
            )}
          </nav>
          <div className="border-t border-line p-1.5">
            <button role="menuitem" disabled={busy} onClick={logout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-danger hover:bg-danger/10 disabled:opacity-50">
              <Icon name="LogOut" className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
