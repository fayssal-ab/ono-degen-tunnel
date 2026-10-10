"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatMoney } from "@/lib/money";

interface Result {
  found: boolean;
  rank?: number;
  maskedName?: string;
  wagered?: string;
  gap?: string | null;
  targetRank?: number | null;
  reason?: string;
}

// "Find me" (prompt §5.2): type a full username, get back only the masked row.
// `initial` pre-fills from the ?find= query (command-palette deep link).
export function FindMe({ initial = "" }: { initial?: string }) {
  const [username, setUsername] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      if (res.status === 429) {
        setError("Too many lookups — wait a minute and try again.");
        return;
      }
      setResult((await res.json()) as Result);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface p-5">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-bg-1 px-3">
          <Icon name="Crosshair" className="h-4 w-4 text-text-2" />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your casino username"
            className="h-full flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-2 focus:outline-none"
            aria-label="Your casino username"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gold px-5 text-sm font-semibold text-bg-0 hover:bg-gold-hi disabled:opacity-50"
        >
          {loading ? "Searching…" : "Find me"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {result && !result.found && (
        <p className="mt-3 text-sm text-text-1">
          {result.reason === "no_active_period"
            ? "No leaderboard is live right now."
            : "No one by that name is on the current board. Check the spelling, or start wagering with the code."}
        </p>
      )}

      {result?.found && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-gold/30 bg-gold/5 p-4">
          <div>
            <p className="label">Rank</p>
            <p className="font-mono text-xl font-bold text-gold">#{result.rank}</p>
          </div>
          <div>
            <p className="label">Player</p>
            <p className="font-mono text-text-0">{result.maskedName}</p>
          </div>
          <div>
            <p className="label">Wagered</p>
            <p className="font-mono text-text-0">{formatMoney(result.wagered ?? "0")}</p>
          </div>
          {result.gap && result.targetRank != null && (
            <p className="w-full text-sm text-text-1">
              You need <span className="font-mono font-semibold text-gold">{result.gap}</span> more
              to reach rank <span className="font-mono text-text-0">#{result.targetRank}</span>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
