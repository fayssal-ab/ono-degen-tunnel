"use client";

import { useJoinReader } from "@/components/tournament/useJoinReader";

// Reads Kick chat while a GB round is open and relays `!gb <amount>` guesses.
// Keep the admin GB page open during the round (same as giveaways/tournament).
const GB = { match: /^\s*!gb\s+\S/i, endpoint: "/api/admin/gb/guess" };
const LABEL = { off: "Chat reader off", connecting: "Connecting to Kick chat…", live: "Listening to Kick chat for !gb", reconnecting: "Reconnecting to Kick chat…", error: "Kick chat unreachable — retrying" } as const;

export function GbChatListener({ active }: { active: boolean }) {
  const { status, events } = useJoinReader(active, undefined, GB);
  return (
    <div className="surface p-4 text-sm">
      <p className={status === "live" ? "text-volt" : status === "off" ? "text-text-2" : "text-gold"}>● {active ? LABEL[status] : "Open a round to start reading !gb from chat"}</p>
      {events.length > 0 && (
        <ul className="mt-2 max-h-36 space-y-0.5 overflow-y-auto font-mono text-[11px] text-text-2">
          {events.map((e, i) => <li key={i}><span className="text-text-1">{e.username}</span> · {e.outcome.replaceAll("_", " ")}</li>)}
        </ul>
      )}
    </div>
  );
}
