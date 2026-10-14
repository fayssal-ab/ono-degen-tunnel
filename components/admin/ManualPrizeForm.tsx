"use client";

import { useEffect, useState } from "react";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Icon } from "@/components/ui/Icon";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { SubmitButton } from "@/components/admin/client";

// Admin → Prizes → "Add a prize": the winner is checked live against Kick or
// the Discord server while typing; the button only unlocks for a real account
// (the server action checks again before saving).
type Platform = "kick" | "discord";
interface Winner { platform: Platform; id: string; username: string; display: string; avatar: string | null; source: string }
type Check = { state: "idle" } | { state: "checking" } | { state: "found"; winner: Winner } | { state: "missing" } | { state: "error" };

const input = "h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none";
const TINT: Record<Platform, string> = { kick: "border-[#53fc18] bg-[#53fc18]/10 text-[#53fc18]", discord: "border-[#5865F2] bg-[#5865F2]/15 text-[#8f99ff]" };

export function ManualPrizeForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  const [platform, setPlatform] = useState<Platform>("kick");
  const [name, setName] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle" });

  useEffect(() => {
    const q = name.trim();
    if (q.length < 2) { setCheck({ state: "idle" }); return; }
    setCheck({ state: "checking" });
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/prizes/lookup?platform=${platform}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal, cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { winner: Winner | null };
        setCheck(d.winner ? { state: "found", winner: d.winner } : { state: "missing" });
      } catch (e) {
        if (!ctrl.signal.aborted) setCheck({ state: "error" });
        void e;
      }
    }, 450);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [name, platform]);

  const found = check.state === "found" ? check.winner : null;

  return (
    <form action={action} className="surface space-y-4 p-6">
      <div>
        <p className="label">Add a prize won elsewhere</p>
        <p className="mt-1 text-sm text-text-1">Stream giveaway, bonus, tip… The winner must be a real Kick or Discord account — a ticket opens for them on Discord.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Winner platform">
            {(["kick", "discord"] as Platform[]).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={platform === p} onClick={() => setPlatform(p)}
                className={`press flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${platform === p ? TINT[p] : "border-line bg-bg-1 text-text-1 hover:border-line-strong"}`}>
                <BrandIcon brand={p} className="h-4 w-4" /> {p === "kick" ? "Kick" : "Discord"}
              </button>
            ))}
          </div>
          <input type="hidden" name="platform" value={platform} />
          <label className="block">
            <span className="label">Winner&apos;s {platform === "kick" ? "Kick" : "Discord"} username</span>
            <input name="winner" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off"
              placeholder={platform === "kick" ? "kick username" : "discord username"} className={`${input} mt-1`} />
          </label>

          <div aria-live="polite" className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 text-sm ${found ? "border-volt/50 bg-volt/10" : check.state === "missing" || check.state === "error" ? "border-danger/40 bg-danger/10" : "border-line bg-bg-1"}`}>
            {found ? (
              <>
                <UserAvatar src={found.avatar ?? ""} name={found.display} className="h-10 w-10 shrink-0 rounded-xl border border-line" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold text-text-0"><Icon name="BadgeCheck" className="h-4 w-4 text-volt" /> <span className="truncate">{found.display}</span></span>
                  <span className="block truncate text-xs text-text-2">@{found.username} · {found.source} · id {found.id}</span>
                </span>
              </>
            ) : check.state === "checking" ? (
              <span className="flex items-center gap-2 text-text-1"><Icon name="LoaderCircle" className="h-4 w-4 animate-spin" /> Checking {platform === "kick" ? "Kick" : "Discord"}…</span>
            ) : check.state === "missing" ? (
              <span className="flex items-center gap-2 text-danger"><Icon name="UserX" className="h-4 w-4" /> No {platform === "kick" ? "Kick account" : "member of the Discord server"} with that name.</span>
            ) : check.state === "error" ? (
              <span className="flex items-center gap-2 text-danger"><Icon name="AlertTriangle" className="h-4 w-4" /> Couldn&apos;t check right now. Try again.</span>
            ) : (
              <span className="flex items-center gap-2 text-text-2"><Icon name="ShieldCheck" className="h-4 w-4" /> Type a name to verify the account.</span>
            )}
          </div>
        </div>

        <div className="grid content-start gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="label">Event</span>
            <input name="title" required maxLength={191} placeholder="Friday stream giveaway" className={`${input} mt-1`} /></label>
          <label className="block"><span className="label">Amount ($)</span>
            <input name="amount" inputMode="decimal" placeholder="20" className={`${input} mt-1`} /></label>
          <label className="block"><span className="label">Prize (text)</span>
            <input name="prize_label" maxLength={120} placeholder="$20 tip" className={`${input} mt-1`} /></label>
        </div>
      </div>

      {found ? (
        <SubmitButton className="press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gold px-5 text-sm font-semibold text-bg-0 hover:bg-gold-hi">
          <Icon name="Plus" className="h-4 w-4" /> Add prize for {found.display}
        </SubmitButton>
      ) : (
        <button type="button" disabled className="inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-xl border border-line px-5 text-sm text-text-2">
          <Icon name="Lock" className="h-4 w-4" /> Verify the winner first
        </button>
      )}
    </form>
  );
}
