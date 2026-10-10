import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";

// Tournaments (prompt §5.4): single-elim 8-slot slot battle. Reuses JBALLIN's
// round model (QF=8 → SF=4 → F=2 → champion) but with scored matches so the
// bracket can glow the winner's path gold.

export interface Tournament {
  id: number;
  title: string;
  status: "upcoming" | "live" | "finished";
  prize: string;
  created_at: string;
}

export interface Competitor {
  seed: number;
  name: string;
  provider: string | null;
  image_url: string | null;
}

export interface Match {
  round: number; // 1 QF, 2 SF, 3 Final
  match_index: number;
  a: { seed: number | null; score: string | null };
  b: { seed: number | null; score: string | null };
  winner_seed: number | null;
}

export interface Bracket {
  tournament: Tournament;
  competitors: Map<number, Competitor>;
  rounds: Record<number, Match[]>;
  championSeed: number | null;
}

export async function getLiveTournament(): Promise<Tournament | null> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT id, title, status, prize, created_at FROM tournament WHERE status IN ('live','finished') ORDER BY created_at DESC LIMIT 1"
    );
    return (rows[0] as Tournament | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function getBracket(t: Tournament): Promise<Bracket> {
  const pool = getPool();
  const [slotRows] = await pool.query<RowDataPacket[]>(
    "SELECT seed, slot_name, provider, image_url FROM tournament_slots WHERE tournament_id = ? ORDER BY seed ASC",
    [t.id]
  );
  const competitors = new Map<number, Competitor>();
  for (const s of slotRows) {
    competitors.set(s.seed as number, {
      seed: s.seed as number,
      name: s.slot_name as string,
      provider: (s.provider as string) ?? null,
      image_url: (s.image_url as string) ?? null,
    });
  }

  const [matchRows] = await pool.query<RowDataPacket[]>(
    "SELECT round, match_index, seed_a, seed_b, score_a, score_b, winner_seed FROM tournament_matches WHERE tournament_id = ? ORDER BY round ASC, match_index ASC",
    [t.id]
  );
  const rounds: Record<number, Match[]> = { 1: [], 2: [], 3: [] };
  let championSeed: number | null = null;
  for (const m of matchRows) {
    const match: Match = {
      round: m.round as number,
      match_index: m.match_index as number,
      a: { seed: (m.seed_a as number) ?? null, score: m.score_a != null ? String(m.score_a) : null },
      b: { seed: (m.seed_b as number) ?? null, score: m.score_b != null ? String(m.score_b) : null },
      winner_seed: (m.winner_seed as number) ?? null,
    };
    (rounds[match.round] ??= []).push(match);
    if (match.round === 3 && match.winner_seed != null) championSeed = match.winner_seed;
  }

  return { tournament: t, competitors, rounds, championSeed };
}
