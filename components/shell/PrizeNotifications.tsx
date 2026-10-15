"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";

// Prize notifications in the top bar: a bell with the "you won" / "you got
// paid" feed, and a celebration card for a fresh unclaimed win. Both read the
// feed AccountButton gets from /api/me. Opening the bell (or the prize page)
// marks everything read on the server; a dismissed popup stays dismissed for
// the browser session.

export interface PrizeNotification {
  key: string; kind: "won" | "paid"; at: string; award_id: number; title: string; source: string;
  place: number | null; amount: string | null; prize_label: string; claimed: boolean; unread: boolean;
}
export interface NotificationFeed { items: PrizeNotification[]; unread: number }

const money = (v: string) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const prize = (n: PrizeNotification) => (n.amount != null ? money(n.amount) : n.prize_label || "a prize");
const MEDAL = ["", "🥇", "🥈", "🥉"];

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function markSeen() {
  try { await fetch("/api/account/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seen: true }) }); } catch { /* next open retries */ }
}

/** Where a notification leads: its own card on the prize page. */
export const prizeHref = (awardId: number) => `/account/prizes#prize-${awardId}`;

/** `feed` null = signed out: the bell invites to sign up instead. */
export function PrizeBell({ feed, onSeen }: { feed: NotificationFeed | null; onSeen?: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && feed && feed.unread > 0) { markSeen(); onSeen?.(); }
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button onClick={toggle} aria-haspopup="menu" aria-expanded={open}
        aria-label={feed?.unread ? `Notifications, ${feed.unread} new` : "Notifications"}
        className={`press relative grid h-10 w-10 place-items-center rounded-xl border bg-bg-1 ${open ? "border-gold text-gold" : "border-line text-text-1 hover:border-gold hover:text-gold"}`}>
        <Icon name="Bell" className={`h-[18px] w-[18px] ${feed?.unread ? "origin-top animate-[bell-ring_1.2s_ease-in-out_2]" : ""}`} />
        {feed && feed.unread > 0 && (
          <span aria-hidden className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 font-mono text-[11px] font-bold leading-none text-white ring-2 ring-bg-0 shadow-[0_2px_10px_rgba(255,77,94,0.55)]">
            {feed.unread > 9 ? "9+" : feed.unread}
          </span>
        )}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line-strong bg-bg-1 shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-text-0">
              Notifications
              {feed && feed.items.length > 0 && <span className="rounded-full bg-bg-3 px-2 py-0.5 font-mono text-[11px] font-semibold text-text-1">{feed.items.length}</span>}
            </p>
            <Link href="/account/prizes" onClick={() => setOpen(false)} className="text-xs font-semibold text-gold hover:underline">My prizes</Link>
          </div>
          {!feed ? (
            <div className="flex flex-col items-center gap-3 px-5 py-7 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold/15 text-gold"><Icon name="Trophy" className="h-6 w-6" /></span>
              <p className="text-sm text-text-1">Sign up to get a notification the moment you win a prize on stream.</p>
              <a href="/api/auth/discord/start?next=/account/prizes"
                className="press inline-flex h-10 items-center gap-2 rounded-xl bg-[#5865F2] px-4 text-sm font-bold text-white hover:brightness-110">
                <BrandIcon brand="discord" className="h-4 w-4" />
                Sign up
              </a>
            </div>
          ) : feed.items.length === 0 ? (
            <p className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-text-2"><Icon name="BellOff" className="h-6 w-6" /> Nothing yet. Win something on stream!</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto p-1.5">
              {feed.items.map((n) => (
                <li key={n.key}>
                  <Link href={prizeHref(n.award_id)} role="menuitem" onClick={() => setOpen(false)}
                    className={`flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-bg-2 ${n.unread ? "bg-gold/5" : ""}`}>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base ${n.kind === "paid" ? "bg-volt/15 text-volt" : "bg-gold/15 text-gold"}`}>
                      {n.kind === "paid" ? <Icon name="Banknote" className="h-4 w-4" /> : n.place && n.place <= 3 ? MEDAL[n.place] : <Icon name="Trophy" className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-text-0">
                        {n.kind === "paid" ? <>Your <strong className="text-volt">{prize(n)}</strong> was paid</> : <>You won <strong className="text-gold">{prize(n)}</strong></>}
                      </span>
                      <span className="block truncate text-xs text-text-2">{n.title} · {ago(n.at)}</span>
                      {n.kind === "won" && !n.claimed && <span className="mt-1 inline-block rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase text-bg-0">Claim it</span>}
                    </span>
                    {n.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" aria-label="new" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2;
  const r = 70 + (i % 3) * 28;
  return { dx: `${Math.cos(a) * r}px`, dy: `${Math.sin(a) * r}px`, c: ["var(--color-gold)", "var(--color-magenta)", "var(--color-cyan)"][i % 3], d: `${(i % 6) * 40}ms` };
});

/**
 * Celebration card for the newest unread, unclaimed win. Portalled to <body>:
 * the top bar's backdrop blur would otherwise pin a fixed child to the bar.
 */
export function WinToast({ feed, onSeen }: { feed: NotificationFeed; onSeen: () => void }) {
  const fresh = feed.items.find((n) => n.kind === "won" && n.unread && !n.claimed);
  const [hidden, setHidden] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    try { setHidden(sessionStorage.getItem("odt:win-toast")); } catch { /* storage blocked: show it */ }
    setMounted(true);
  }, []);
  if (!mounted || !fresh || hidden === fresh.key) return null;

  function close(seen: boolean) {
    try { sessionStorage.setItem("odt:win-toast", fresh!.key); } catch { /* ignore */ }
    setHidden(fresh!.key);
    if (seen) { markSeen(); onSeen(); }
  }

  return createPortal(
    <div role="alertdialog" aria-labelledby="win-title" className="prize-pop fixed bottom-4 right-4 z-[70] w-[min(24rem,calc(100vw-2rem))]">
      <div className="relative overflow-hidden rounded-[22px] border border-gold/60 bg-bg-1 p-5 shadow-[0_20px_60px_-20px_rgba(245,196,81,0.6)]">
        <span aria-hidden className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full bg-gold/25 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-magenta/20 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute left-12 top-12">
          {SPARKS.map((s, i) => <span key={i} className="prize-spark" style={{ background: s.c, animationDelay: s.d, ["--dx" as string]: s.dx, ["--dy" as string]: s.dy }} />)}
        </span>
        <button onClick={() => close(false)} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-text-2 hover:bg-bg-2 hover:text-text-0"><Icon name="X" className="h-4 w-4" /></button>
        <div className="relative flex items-start gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-gold/50 bg-gradient-to-br from-gold/40 to-gold/5 text-3xl shadow-[0_0_30px_-6px_var(--color-gold)]">
            {fresh.place && fresh.place <= 3 ? MEDAL[fresh.place] : <Icon name="Trophy" className="h-8 w-8 text-gold" />}
          </span>
          <div className="min-w-0 pr-6">
            <p className="label text-gold">New prize</p>
            <p id="win-title" className="font-bang text-3xl leading-none tracking-wide text-text-0">YOU WON!</p>
            <p className="mt-1 font-mono text-2xl font-bold text-gold">{prize(fresh)}</p>
            <p className="truncate text-sm text-text-1">{fresh.title}</p>
          </div>
        </div>
        <Link href={prizeHref(fresh.award_id)} onClick={() => close(true)}
          className="press relative mt-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-gold text-sm font-bold text-bg-0 hover:bg-gold-hi">
          <Icon name="HandCoins" className="h-4 w-4" /> Claim my prize
        </Link>
      </div>
    </div>,
    document.body,
  );
}
