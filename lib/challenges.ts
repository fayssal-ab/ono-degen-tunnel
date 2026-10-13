import "server-only";
import type { RowDataPacket, PoolConnection, ResultSetHeader } from "mysql2/promise";
import { getPool } from "./db";
import { maskUsername } from "./mask";
import { d } from "./money";
import { EventError, withTx } from "./events/common";
import { recordAward } from "./prizes";

// Challenges (prompt §5.5): "first to hit Nx on <slot> with at least $B bet
// wins <prize>". There is no casino-history integration, so claims are
// verified by hand: the player sends their replay/bet proof off-site (Discord
// — the procedure is on the public page), an admin records it here and then
// accepts or rejects it. Acceptance re-checks the thresholds in decimal, the
// expiry against the time the win was played, and runs under the challenge
// row lock; a unique index allows at most one accepted claim per challenge.
// A challenge shows as claimed only once a claim has been accepted.

export type ChallengeStatus = "open" | "claimed" | "expired";

export interface Challenge {
  id: number;
  slot_name: string;
  provider: string | null;
  image_url: string | null;
  required_multiplier: string;
  min_bet: string;
  prize: string;
  status: ChallengeStatus;
  claimedBy: string | null; // masked
  claimed_at: string | null;
  expires_at: string | null;
  winning: { multiplier: string; bet: string } | null;
}

/** Effective status: an open challenge past its expiry reads as expired. */
const STATUS_SQL = `CASE WHEN c.status = 'open' AND c.expires_at IS NOT NULL AND c.expires_at <= UTC_TIMESTAMP() THEN 'expired' ELSE c.status END`;

// Throws on DB failure so the page can show an error, not "no challenges".
export async function getChallenges(): Promise<Challenge[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT c.id, c.slot_name, c.provider, c.image_url, c.required_multiplier, c.min_bet, c.prize,
            ${STATUS_SQL} AS eff_status, c.claimed_by, c.claimed_at, c.expires_at,
            a.multiplier AS win_multiplier, a.bet AS win_bet
     FROM challenges c
     LEFT JOIN challenge_claims a ON a.challenge_id = c.id AND a.status = 'accepted'
     ORDER BY FIELD(eff_status,'open','claimed','expired'), c.position ASC, c.id DESC`
  );
  return rows.map((r) => {
    // Never present "claimed" without a validated winner.
    const claimed = r.eff_status === "claimed" && r.claimed_by;
    return {
      id: r.id as number,
      slot_name: r.slot_name as string,
      provider: (r.provider as string) || null,
      image_url: (r.image_url as string) ?? null,
      required_multiplier: String(r.required_multiplier),
      min_bet: String(r.min_bet),
      prize: r.prize as string,
      status: (claimed ? "claimed" : r.eff_status === "claimed" ? "expired" : r.eff_status) as ChallengeStatus,
      claimedBy: claimed ? maskUsername(String(r.claimed_by)) : null,
      claimed_at: claimed ? String(r.claimed_at) : null,
      expires_at: (r.expires_at as string) ?? null,
      winning: claimed && r.win_multiplier != null ? { multiplier: String(r.win_multiplier), bet: String(r.win_bet) } : null,
    };
  });
}

// ── admin ──

export interface AdminChallenge {
  id: number;
  slot_name: string;
  provider: string;
  image_url: string | null;
  required_multiplier: string;
  min_bet: string;
  prize: string;
  status: ChallengeStatus;
  stored_status: ChallengeStatus;
  claimed_by: string | null;
  expires_at: string | null;
  position: number;
  created_at: string;
  claims: Claim[];
}

export interface Claim {
  id: number;
  claimant: string;
  proof_url: string;
  proof_ref: string;
  bet: string;
  multiplier: string;
  played_at: string;
  status: "pending" | "accepted" | "rejected";
  review_note: string;
  created_at: string;
  reviewed_at: string | null;
}

export async function getAdminChallenges(): Promise<AdminChallenge[]> {
  const pool = getPool();
  const [[rows], [claims]] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT c.*, ${STATUS_SQL} AS eff_status FROM challenges c
       ORDER BY FIELD(eff_status,'open','claimed','expired'), c.position ASC, c.id DESC LIMIT 100`
    ),
    pool.query<RowDataPacket[]>("SELECT * FROM challenge_claims ORDER BY FIELD(status,'pending','accepted','rejected'), created_at DESC"),
  ]);
  return rows.map((r) => ({
    id: r.id as number,
    slot_name: String(r.slot_name),
    provider: String(r.provider ?? ""),
    image_url: (r.image_url as string) ?? null,
    required_multiplier: String(r.required_multiplier),
    min_bet: String(r.min_bet),
    prize: String(r.prize),
    status: r.eff_status as ChallengeStatus,
    stored_status: r.status as ChallengeStatus,
    claimed_by: (r.claimed_by as string) ?? null,
    expires_at: (r.expires_at as string) ?? null,
    position: Number(r.position),
    created_at: String(r.created_at),
    claims: claims.filter((c) => c.challenge_id === r.id).map((c) => ({
      id: Number(c.id),
      claimant: String(c.claimant),
      proof_url: String(c.proof_url),
      proof_ref: String(c.proof_ref),
      bet: String(c.bet),
      multiplier: String(c.multiplier),
      played_at: String(c.played_at),
      status: c.status as Claim["status"],
      review_note: String(c.review_note),
      created_at: String(c.created_at),
      reviewed_at: (c.reviewed_at as string) ?? null,
    })),
  }));
}

export interface ChallengeInput {
  slot_name: string;
  provider: string;
  image_url: string;
  required_multiplier: string;
  min_bet: string;
  prize: string;
  expires_at: string | null;
  position: number;
}

export async function createChallenge(input: ChallengeInput): Promise<number> {
  const [res] = await getPool().query<ResultSetHeader>(
    `INSERT INTO challenges (slot_name, provider, image_url, required_multiplier, min_bet, prize, expires_at, position, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
    [input.slot_name, input.provider, input.image_url || null, input.required_multiplier, input.min_bet, input.prize, input.expires_at, input.position]
  );
  return res.insertId;
}

async function lockChallenge(conn: PoolConnection, id: number) {
  const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM challenges WHERE id = ? FOR UPDATE", [id]);
  if (!rows[0]) throw new EventError("challenge_not_found");
  return rows[0];
}

/** Editable only while open with no claim recorded (pending claims were made under the current terms). */
export async function updateChallenge(id: number, input: ChallengeInput): Promise<void> {
  await withTx(async (conn) => {
    const c = await lockChallenge(conn, id);
    if (c.status !== "open") throw new EventError("challenge_locked");
    const [claims] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM challenge_claims WHERE challenge_id = ? AND status <> 'rejected'", [id]);
    if (Number(claims[0].n) > 0) throw new EventError("challenge_has_claims");
    await conn.query(
      `UPDATE challenges SET slot_name = ?, provider = ?, image_url = ?, required_multiplier = ?, min_bet = ?, prize = ?, expires_at = ?, position = ? WHERE id = ?`,
      [input.slot_name, input.provider, input.image_url || null, input.required_multiplier, input.min_bet, input.prize, input.expires_at, input.position, id]
    );
  });
}

export async function expireChallenge(id: number): Promise<void> {
  await withTx(async (conn) => {
    const c = await lockChallenge(conn, id);
    if (c.status !== "open") throw new EventError("challenge_locked");
    await conn.query("UPDATE challenges SET status = 'expired', expires_at = LEAST(COALESCE(expires_at, UTC_TIMESTAMP()), UTC_TIMESTAMP()) WHERE id = ?", [id]);
  });
}

export async function deleteChallenge(id: number): Promise<void> {
  await withTx(async (conn) => {
    const c = await lockChallenge(conn, id);
    const [claims] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM challenge_claims WHERE challenge_id = ?", [id]);
    if (c.status === "claimed" || Number(claims[0].n) > 0) throw new EventError("challenge_has_claims", "expire it instead to keep the record");
    await conn.query("DELETE FROM challenges WHERE id = ?", [id]);
  });
}

export interface ClaimInput {
  claimant: string;
  proof_url: string;
  proof_ref: string;
  bet: string;
  multiplier: string;
  played_at: string;
}

/** Decimal threshold + timing checks shared by record and accept (pure). */
export function claimProblems(c: { required_multiplier: string; min_bet: string; created_at: string; expires_at: string | null }, claim: Pick<ClaimInput, "bet" | "multiplier" | "played_at">): string[] {
  const problems: string[] = [];
  if (d(claim.multiplier).lt(d(c.required_multiplier))) problems.push(`multiplier ${claim.multiplier}× is below the ${c.required_multiplier}× target`);
  if (d(claim.bet).lt(d(c.min_bet))) problems.push(`bet ${claim.bet} is below the ${c.min_bet} minimum`);
  // played_at comes from a minute-precision admin input: compare by minute
  if (claim.played_at.slice(0, 16) < String(c.created_at).slice(0, 16)) problems.push("played before the challenge was published");
  if (c.expires_at && claim.played_at > String(c.expires_at)) problems.push("played after the challenge expired");
  return problems;
}

export async function recordClaim(challengeId: number, input: ClaimInput): Promise<number> {
  if (!input.proof_url && !input.proof_ref) throw new EventError("proof_required", "a replay URL or a proof reference is required");
  return withTx(async (conn) => {
    const c = await lockChallenge(conn, challengeId);
    if (c.status === "claimed") throw new EventError("challenge_already_claimed");
    const [played] = await conn.query<RowDataPacket[]>("SELECT ? > UTC_TIMESTAMP() AS future", [input.played_at]);
    if (Number(played[0].future)) throw new EventError("invalid_input", "played time is in the future");
    const [res] = await conn.query<ResultSetHeader>(
      `INSERT INTO challenge_claims (challenge_id, claimant, proof_url, proof_ref, bet, multiplier, played_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [challengeId, input.claimant, input.proof_url, input.proof_ref, input.bet, input.multiplier, input.played_at]
    );
    return res.insertId;
  });
}

export async function acceptClaim(claimId: number, note: string): Promise<void> {
  await withTx(async (conn) => {
    const [peek] = await conn.query<RowDataPacket[]>("SELECT challenge_id FROM challenge_claims WHERE id = ?", [claimId]);
    if (!peek[0]) throw new EventError("claim_not_found");
    const c = await lockChallenge(conn, Number(peek[0].challenge_id));
    const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM challenge_claims WHERE id = ? FOR UPDATE", [claimId]);
    const claim = rows[0];
    if (claim.status !== "pending") throw new EventError("claim_not_pending");
    if (c.status === "claimed") throw new EventError("challenge_already_claimed");
    const problems = claimProblems(
      { required_multiplier: String(c.required_multiplier), min_bet: String(c.min_bet), created_at: String(c.created_at), expires_at: c.expires_at ? String(c.expires_at) : null },
      { bet: String(claim.bet), multiplier: String(claim.multiplier), played_at: String(claim.played_at) }
    );
    if (problems.length) throw new EventError("claim_invalid", problems.join("; "));
    await conn.query("UPDATE challenge_claims SET status = 'accepted', review_note = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?", [note, claimId]);
    await conn.query("UPDATE challenges SET status = 'claimed', claimed_by = ?, claimed_at = ? WHERE id = ?", [claim.claimant, claim.played_at, c.id]);
    await recordAward(conn, { source: "challenge", sourceRef: `challenge:${c.id}`, title: `${c.slot_name} ${c.required_multiplier}× challenge`, place: 1, winner: String(claim.claimant), prizeLabel: String(c.prize) });
    await conn.query(
      "UPDATE challenge_claims SET status = 'rejected', review_note = 'another claim was accepted', reviewed_at = UTC_TIMESTAMP() WHERE challenge_id = ? AND status = 'pending'",
      [c.id]
    );
  });
}

export async function rejectClaim(claimId: number, note: string): Promise<void> {
  await withTx(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT status FROM challenge_claims WHERE id = ? FOR UPDATE", [claimId]);
    if (!rows[0]) throw new EventError("claim_not_found");
    if (rows[0].status !== "pending") throw new EventError("claim_not_pending");
    await conn.query("UPDATE challenge_claims SET status = 'rejected', review_note = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?", [note, claimId]);
  });
}
