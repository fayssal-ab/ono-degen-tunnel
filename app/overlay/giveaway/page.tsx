import type { Metadata } from "next";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { maskUsername } from "@/lib/mask";
import { getOpenGiveaways } from "@/lib/giveaways";

export const metadata: Metadata = { title: "Giveaway overlay", robots: { index: false } };
export const dynamic = "force-dynamic";

// Transparent OBS browser-source overlay (prompt §5.10). Add as a browser
// source at 1920×1080; the page paints nothing but the card, so the stream
// shows through. Auto-refreshes so the operator never has to touch it.
async function getLatestWinner(): Promise<{ name: string; prize: string; title: string } | null> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT w.kick_username, w.prize, g.title, w.drawn_at
       FROM giveaway_winners w JOIN giveaways g ON g.id = w.giveaway_id
       ORDER BY w.drawn_at DESC LIMIT 1`
    );
    const r = rows[0];
    if (!r) return null;
    // only celebrate recent draws (last 2 minutes)
    const age = Date.now() - new Date(String(r.drawn_at).replace(" ", "T") + "Z").getTime();
    if (age > 120_000) return null;
    return { name: maskUsername(String(r.kick_username)), prize: String(r.prize), title: String(r.title) };
  } catch {
    return null;
  }
}

export default async function GiveawayOverlay() {
  const [winner, open] = await Promise.all([getLatestWinner(), getOpenGiveaways()]);
  const active = open[0] ?? null;

  return (
    <>
      {/* OBS transparency: override the global dark body background */}
      <style>{`html,body{background:transparent !important}`}</style>
      {/* refresh every 5s so the operator never touches it */}
      <meta httpEquiv="refresh" content="5" />

      <div className="flex min-h-dvh items-center justify-center p-10">
        {winner ? (
          <div className="gold-border surface min-w-[520px] px-12 py-10 text-center" style={{ background: "rgba(11,11,16,0.86)" }}>
            <p className="label">Winner</p>
            <p className="mt-3 font-display text-5xl font-extrabold text-gold">{winner.name}</p>
            <p className="mt-3 text-xl text-text-0">{winner.prize}</p>
            <p className="mt-1 text-sm text-text-2">{winner.title}</p>
          </div>
        ) : active ? (
          <div className="surface min-w-[520px] px-12 py-10 text-center" style={{ background: "rgba(11,11,16,0.86)" }}>
            <p className="label text-volt">Giveaway open</p>
            <p className="mt-3 font-display text-4xl font-extrabold text-text-0">{active.prize}</p>
            {active.type === "keyword" && active.keyword && (
              <p className="mt-4 text-2xl">
                Type <span className="font-mono text-gold">{active.keyword}</span> in chat
              </p>
            )}
            <p className="mt-3 font-mono text-sm text-text-2">{active.entrants.toLocaleString()} entered</p>
          </div>
        ) : null}
      </div>
    </>
  );
}
