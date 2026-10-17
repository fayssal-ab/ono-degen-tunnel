"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Icon } from "@/components/ui/Icon";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { confirmDialog } from "@/components/ui/ConfirmDialog";

// Giveaway winner check (dashboard modal). The drawn winner has WINDOW seconds
// to type anything in Kick chat. Their messages show live; the first one
// confirms them (prize recorded → Discord ticket + site notification). Silence
// → no prize and a big Reroll. The admin can still accept them by hand.

export const WINDOW = 15;

export interface ChatLine { text: string; at: number }
export interface DrawnWinner { username: string; avatar: string | null; nonce: number }
interface Info {
  response: "waiting" | "confirmed" | "no_show";
  prize: string;
  chat: { id: number; text: string }[];
  responseText: string;
  account: { id: number; name: string } | null;
  kick: string | null;
  discord: string | null;
  award: { id: number; status: string; ticket: string | null } | null;
}
type Phase = "waiting" | "saving" | "confirmed" | "no_show";

function buzz(muted: boolean) {
  if (muted) return;
  try {
    const a = new AudioContext();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(220, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(90, a.currentTime + 0.5);
    g.gain.setValueAtTime(0.08, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.55);
    o.connect(g);
    g.connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.6);
  } catch { /* no audio */ }
}

function LinkRow({ brand, label, value, tint }: { brand: "kick" | "discord"; label: string; value: string | null; tint: string }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${value ? "border-volt/40 bg-volt/10" : "border-line bg-bg-0/40"}`}>
      <span className={`grid h-7 w-7 place-items-center rounded-lg ${tint}`}><BrandIcon brand={brand} className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-text-2">{label}</span>
        <span className={`block truncate text-sm font-semibold ${value ? "text-text-0" : "text-text-2"}`}>{value ?? "Not linked"}</span>
      </span>
      <Icon name={value ? "CircleCheck" : "CircleX"} className={`h-4 w-4 shrink-0 ${value ? "text-volt" : "text-text-2"}`} />
    </div>
  );
}

/** "$25 bonus buy" / "25$" / "50 USD" → "25" (pre-fills the payout; the admin types what was really won). */
function suggestAmount(prize: string): string {
  const m = prize.replace(/,/g, "").match(/(?:[$€£]\s*(\d{1,9}(?:\.\d{1,2})?))|(?:(\d{1,9}(?:\.\d{1,2})?)\s*(?:[$€£]|usd|usdt|eur|dollars?)(?![a-z]))/i);
  return m?.[1] ?? m?.[2] ?? "";
}

export function WinnerCheck({
  giveawayId, winner, messages: socketLines, since, chat, isSubscriber, muted, guildId, onReroll, onClose, resume = false,
}: {
  giveawayId: number; winner: DrawnWinner; messages: ChatLine[]; since: number;
  chat: { channel: string; status: "off" | "connecting" | "connected" | "error" };
  isSubscriber: boolean; muted: boolean; guildId: string | null;
  onReroll: () => void; onClose: () => void;
  /** reopened from the winners list for a confirmed winner still without a payout: no timer */
  resume?: boolean;
}) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [phase, setPhase] = useState<Phase>(resume ? "confirmed" : "waiting");
  const [amount, setAmount] = useState<string | null>(null);
  const [awarding, setAwarding] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  // lines from the Kick webhook (server), stamped when first seen here; a line
  // the browser socket already showed isn't repeated
  const [serverLines, setServerLines] = useState<(ChatLine & { id: number })[]>([]);
  const messages = useMemo(() => {
    const extra = serverLines.filter((c) => !socketLines.some((m) => m.text === c.text.slice(0, 300) && Math.abs(m.at - c.at) < 15000));
    return [...socketLines, ...extra].sort((a, b) => a.at - b.at);
  }, [socketLines, serverLines]);
  const left = Math.max(0, WINDOW - (now - startedAt) / 1000);

  async function decide(action: "confirm" | "no_show", text = "") {
    setPhase("saving");
    setError(null);
    try {
      const r = await fetch(`/api/admin/giveaways/${giveawayId}/winner`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, nonce: winner.nonce, text }),
      });
      const d = (await r.json()) as { ok?: boolean; info?: Info; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error ?? "failed");
      if (d.info) setInfo(d.info);
      setPhase(action === "confirm" ? "confirmed" : "no_show");
      if (action === "no_show") buzz(muted);
    } catch {
      setError("Couldn't save — check the connection and try again.");
      setPhase(action === "confirm" ? "waiting" : "no_show");
    }
  }

  // countdown
  useEffect(() => {
    if (phase !== "waiting") return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [phase]);

  /** The payout the admin entered becomes the prize (ticket + notification). */
  async function award() {
    const value = (amount ?? suggestAmount(info?.prize ?? "")).trim().replace(/^\$/, "");
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) { setError("Enter the payout as a number, like 4 or 12.50."); return; }
    setAwarding(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/giveaways/${giveawayId}/winner`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "award", nonce: winner.nonce, amount: value }),
      });
      const d = (await r.json()) as { ok?: boolean; info?: Info; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error ?? "failed");
      if (d.info) setInfo(d.info);
    } catch {
      setError("Couldn't create the prize — try again.");
    } finally {
      setAwarding(false);
    }
  }

  // decisions: first chat line confirms; time out → no prize
  const decided = useRef(resume);
  useEffect(() => {
    if (decided.current || phase !== "waiting") return;
    const said = messages.find((m) => m.at >= since);
    if (said) { decided.current = true; decide("confirm", said.text); }
    else if (left <= 0) { decided.current = true; decide("no_show"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, left, phase]);

  // site links now; the prize ticket appears a moment after confirming
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/admin/giveaways/${giveawayId}/winner?nonce=${winner.nonce}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((d: Info | null) => {
        if (!alive || !d) return;
        setInfo(d);
        const now = Date.now();
        setServerLines((prev) => [...prev, ...d.chat.filter((c) => !prev.some((p) => p.id === c.id)).map((c) => ({ ...c, at: now }))]);
      }).catch(() => {});
    load();
    // while waiting: poll fast for webhook-caught lines; once confirmed: until the ticket shows
    const t = setInterval(() => { if (phase === "waiting" || (phase === "confirmed" && !info?.award?.ticket)) load(); }, phase === "waiting" ? 1500 : 3000);
    return () => { alive = false; clearInterval(t); };
  }, [giveawayId, winner.nonce, phase, info?.award?.ticket]);

  useEffect(() => { chatBox.current?.scrollTo({ top: chatBox.current.scrollHeight }); }, [messages.length]);

  const firstAt = messages.find((m) => m.at >= since)?.at;
  const ring = 2 * Math.PI * 34;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-bg-0/80 backdrop-blur-md" aria-label="Close" onClick={() => { if (phase !== "waiting" && phase !== "saving") onClose(); }} />
      <div className={`pop-in surface relative w-full max-w-xl overflow-hidden p-6 sm:p-7 ${phase === "no_show" ? "border-danger/60" : "gold-border"}`}>
        {phase === "confirmed" && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} className="confetti-piece absolute top-0 h-2 w-2 rounded-sm" style={{ left: `${(i * 7 + 5) % 100}%`, background: i % 2 ? "var(--color-gold)" : "var(--color-volt)", animationDelay: `${(i % 5) * 0.08}s` }} />
            ))}
          </div>
        )}

        <div className="relative flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0">
            <span className={`absolute inset-1.5 overflow-hidden rounded-full ring-4 ${phase === "no_show" ? "ring-danger/70 grayscale" : "ring-gold"}`}>
              <UserAvatar src={winner.avatar} name={winner.username} className="h-full w-full rounded-full" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className={`label ${phase === "no_show" ? "text-danger" : "text-gold"}`}>{phase === "no_show" ? "No response — no prize" : phase === "confirmed" ? "Winner confirmed" : "Winner drawn"}</p>
            <p className={`font-bang text-xl tracking-wide [overflow-wrap:anywhere] ${phase === "no_show" ? "text-text-1 line-through decoration-danger/70" : phase === "confirmed" ? "text-gold neon-gold" : ""}`}>{winner.username}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full border border-volt/40 bg-volt/10 px-2 py-0.5 text-volt"><Icon name="Radio" className="h-3 w-3" /> Kick chat</span>
              {isSubscriber && <span className="rounded-full border border-volt/40 bg-volt/10 px-2 py-0.5 text-volt">subscriber</span>}
              <a href={`/verify/${giveawayId}`} target="_blank" className="inline-flex items-center gap-1 text-plasma hover:underline"><Icon name="ShieldCheck" className="h-3 w-3" /> fair proof</a>
            </p>
          </div>

          {/* countdown */}
          <div className="relative grid h-20 w-20 shrink-0 place-items-center" aria-live="polite">
            <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-line-strong)" strokeWidth="6" />
              <circle cx="40" cy="40" r="34" fill="none" strokeWidth="6" strokeLinecap="round"
                stroke={phase === "confirmed" ? "var(--color-volt)" : phase === "no_show" ? "var(--color-danger)" : left <= 5 ? "var(--color-danger)" : "var(--color-gold)"}
                strokeDasharray={ring} strokeDashoffset={phase === "confirmed" ? 0 : ring * (1 - left / WINDOW)} style={{ transition: "stroke-dashoffset 0.1s linear" }} />
            </svg>
            {phase === "confirmed" ? <Icon name="Check" className="h-8 w-8 text-volt" />
              : phase === "no_show" ? <Icon name="X" className="h-8 w-8 text-danger" />
              : <span className={`font-mono text-2xl font-bold ${left <= 5 ? "text-danger" : "text-text-0"}`}>{Math.ceil(left)}</span>}
          </div>
        </div>

        <p className="relative mt-4 rounded-xl border border-line bg-bg-1 px-3 py-2 text-sm text-text-1">
          {phase === "waiting" || phase === "saving"
            ? <><b className="text-text-0">{winner.username}</b> has {WINDOW}s to type anything in chat to claim the prize.</>
            : phase === "confirmed"
              ? <>{resume ? "Confirmed" : firstAt ? (firstAt < startedAt ? <>Answered <b className="text-volt">before the reveal</b></> : <>Answered in <b className="text-volt">{((firstAt - startedAt) / 1000).toFixed(1)}s</b></>) : "Accepted by you"}
                {info?.award ? " — prize recorded, Discord ticket + notification sent." : " — enter what they won to create the prize and the ticket."}</>
              : <>Silent for {WINDOW}s. No prize — roll again.</>}
        </p>

        {/* site links + chat */}
        <div className="relative mt-4 grid gap-4 sm:grid-cols-[1fr_1.2fr]">
          <div className="space-y-2">
            <p className="label">Site account</p>
            <LinkRow brand="kick" label="Kick" value={info?.kick ?? null} tint="bg-[#53fc18]/15 text-[#53fc18]" />
            <LinkRow brand="discord" label="Discord" value={info?.discord ?? null} tint="bg-[#5865F2]/20 text-[#8f99ff]" />
            {info && !info.account && <p className="text-xs text-text-2">No ONO account yet — they can sign up and claim later.</p>}
            {info?.award && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <a href="/admin/prizes" className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-gold hover:brightness-125"><Icon name="Trophy" className="h-3 w-3" /> Prize #{info.award.id}</a>
                {info.award.ticket && guildId
                  ? <a href={`https://discord.com/channels/${guildId}/${info.award.ticket}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-[#5865F2]/50 bg-[#5865F2]/15 px-2 py-0.5 text-[#8f99ff] hover:brightness-125"><Icon name="Ticket" className="h-3 w-3" /> Discord ticket</a>
                  : <span className="text-text-2">ticket opening…</span>}
              </div>
            )}
          </div>
          <div>
            <p className="label mb-2 flex items-center gap-1.5"><Icon name="MessageSquare" className="h-3.5 w-3.5" /> {winner.username}&apos;s chat</p>
            <p className={`-mt-1 mb-2 flex items-center gap-1.5 text-[11px] ${chat.status === "connected" ? "text-volt" : chat.status === "error" ? "text-danger" : "text-text-2"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${chat.status === "connected" ? "bg-volt" : chat.status === "error" ? "bg-danger" : "animate-pulse bg-gold"}`} />
              {chat.status === "connected" ? <>Reading kick.com/{chat.channel} live</> : chat.status === "error" ? <>Can&apos;t read kick.com/{chat.channel} — watching the Kick webhook only</> : <>Connecting to kick.com/{chat.channel}…</>}
            </p>
            <div ref={chatBox} className="h-36 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-bg-0/60 p-2.5">
              {messages.length === 0 ? (
                <p className="flex h-full items-center justify-center gap-2 text-xs text-text-2">
                  {phase === "waiting" ? <><span className="h-2 w-2 animate-pulse rounded-full bg-gold" /> Waiting for a message…</> : "Nothing written."}
                </p>
              ) : messages.map((m, i) => (
                <p key={i} className={`rounded-lg px-2 py-1 text-sm ${m.at === firstAt ? "bg-volt/15 text-text-0" : "text-text-1"}`}>
                  <span className="mr-1.5 font-mono text-[10px] text-text-2">{m.at < startedAt ? "during spin" : `+${((m.at - startedAt) / 1000).toFixed(1)}s`}</span>{m.text}
                </p>
              ))}
            </div>
          </div>
        </div>

        {phase === "confirmed" && info && !info.award && (
          <form onSubmit={(e) => { e.preventDefault(); award(); }} className="relative mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-gold/40 bg-gold/5 p-3">
            <label className="min-w-0 flex-1">
              <span className="label">Payout{info.prize ? <span className="normal-case tracking-normal text-text-2"> · prize: {info.prize}</span> : null}</span>
              <span className="mt-1 flex h-11 items-center gap-1 rounded-lg border border-line bg-bg-0/60 px-3 focus-within:border-gold">
                <span className="font-mono text-text-2">$</span>
                <input autoFocus inputMode="decimal" value={amount ?? suggestAmount(info.prize)} onChange={(e) => setAmount(e.target.value)} placeholder="4"
                  aria-label="Payout in dollars" className="h-full min-w-0 flex-1 bg-transparent font-mono text-lg text-text-0 focus:outline-none" />
              </span>
            </label>
            <button disabled={awarding} className="press inline-flex h-11 items-center gap-2 rounded-lg bg-gold px-4 text-sm font-bold text-bg-0 hover:bg-gold-hi disabled:opacity-50">
              <Icon name={awarding ? "LoaderCircle" : "Ticket"} className={`h-4 w-4 ${awarding ? "animate-spin" : ""}`} /> Create prize &amp; ticket
            </button>
          </form>
        )}

        {error && <p role="alert" className="relative mt-3 text-sm text-danger">{error}</p>}

        <div className="relative mt-5 flex flex-wrap gap-2">
          {phase === "no_show" ? (
            <>
              <button onClick={onReroll} className="press inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gold text-sm font-extrabold uppercase tracking-wide text-bg-0 hover:bg-gold-hi">
                <Icon name="RefreshCw" className="h-4 w-4" /> Reroll
              </button>
              <button onClick={() => decide("confirm", "(accepted by the admin)")} className="press inline-flex h-12 items-center gap-2 rounded-xl border border-line-strong px-4 text-sm text-text-1 hover:border-volt hover:text-volt">
                <Icon name="UserCheck" className="h-4 w-4" /> Accept anyway
              </button>
            </>
          ) : phase === "confirmed" ? (
            <>
              <button onClick={onReroll} className="press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong text-sm hover:border-gold hover:text-gold">
                <Icon name="Shuffle" className="h-4 w-4" /> Draw another
              </button>
              <button onClick={onClose} className={`press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold ${info?.award ? "bg-gold text-bg-0 hover:bg-gold-hi" : "border border-line-strong text-text-1 hover:text-text-0"}`}>
                {info?.award ? "Continue" : "Later"}
              </button>
            </>
          ) : (
            <>
              <button disabled={phase === "saving"} onClick={() => { decided.current = true; decide("confirm", "(accepted by the admin)"); }}
                className="press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong text-sm hover:border-volt hover:text-volt disabled:opacity-50">
                <Icon name="UserCheck" className="h-4 w-4" /> Accept now
              </button>
              <button disabled={phase === "saving"} onClick={async () => {
                  if (!(await confirmDialog({ message: `Skip ${winner.username}? They get no prize and a new winner is drawn.`, confirmLabel: "Skip & reroll", tone: "danger" }))) return;
                  decided.current = true; await decide("no_show"); onReroll();
                }}
                className="press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong text-sm hover:border-danger hover:text-danger disabled:opacity-50">
                <Icon name="RefreshCw" className="h-4 w-4" /> Skip & reroll
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
