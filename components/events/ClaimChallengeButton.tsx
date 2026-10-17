"use client";

import { useState } from "react";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Icon } from "@/components/ui/Icon";

// "Claim" on a challenge card: opens the player's private Discord ticket for
// that challenge (or their existing one) and links to it. Signed out → sign in
// with Discord first; Kick-only accounts are asked to link Discord.
export function ClaimChallengeButton({ id }: { id: number }) {
  const [state, setState] = useState<{ busy?: boolean; url?: string; error?: string }>({});

  async function claim() {
    setState({ busy: true });
    try {
      const r = await fetch(`/api/challenges/${id}/claim`, { method: "POST" });
      const d = (await r.json()) as { ok?: boolean; url?: string; error?: string };
      if (d.ok && d.url) {
        setState({ url: d.url });
        window.open(d.url, "_blank", "noopener");
        return;
      }
      if (d.error === "signed_out") { window.location.href = `/api/auth/discord/start?next=/challenges`; return; }
      setState({
        error: d.error === "discord_required" ? "link"
          : d.error === "challenge_closed" ? "This challenge is closed."
          : d.error === "rate_limited" ? "Too many tries — wait a minute."
          : "Couldn't open the ticket. Try again.",
      });
    } catch {
      setState({ error: "Network error. Try again." });
    }
  }

  if (state.url) {
    return (
      <a href={state.url} target="_blank" rel="noreferrer" className="press inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#5865F2] text-sm font-bold text-white hover:brightness-110">
        <BrandIcon brand="discord" className="h-4 w-4" /> Open your ticket <Icon name="ArrowUpRight" className="h-3.5 w-3.5" />
      </a>
    );
  }
  return (
    <div className="space-y-1.5">
      <button onClick={claim} disabled={state.busy}
        className="press inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-gold text-sm font-bold text-bg-0 hover:bg-gold-hi disabled:opacity-60">
        <Icon name={state.busy ? "LoaderCircle" : "Ticket"} className={`h-4 w-4 ${state.busy ? "animate-spin" : ""}`} /> {state.busy ? "Opening ticket…" : "I hit it — claim"}
      </button>
      {state.error === "link"
        ? <p className="text-xs text-text-1"><a href="/api/auth/discord/start?next=/challenges" className="text-[#8f99ff] underline">Link your Discord</a> to open a claim ticket.</p>
        : state.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}
