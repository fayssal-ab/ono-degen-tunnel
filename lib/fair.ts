// Provably-fair primitives for giveaway draws. Pure + deterministic so the
// exact same math runs server-side (the draw) and client-side (the /verify
// page, via Web Crypto). Documented so anyone can reproduce a result:
//
//   1. commit:  server_seed_hash = SHA256(server_seed)   published up front
//   2. entrants locked at draw → entries_hash = SHA256(name0\nname1\n…)
//   3. winner_index = HMAC_SHA256(server_seed, `${entries_hash}:${nonce}`)
//                     first 13 hex chars → integer → mod entrant_count
//   4. reveal:   server_seed is published; recompute steps 1–3 to verify.
//
// nonce increments per winner so a multi-winner draw stays reproducible and
// permits repeat winners.
import { createHash, createHmac, randomBytes } from "node:crypto";

export function generateServerSeed(): string {
  // Version marker distinguishes seeds that legacy releases already revealed.
  // Still 248 bits of entropy, within the existing CHAR(64) column.
  return "v2" + randomBytes(31).toString("hex");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Canonical join of the ordered entrant identifiers (usernames, lowercased). */
export function entriesHash(orderedNames: string[]): string {
  return sha256(orderedNames.map((n) => n.toLowerCase()).join("\n"));
}

/** Deterministic winner index in [0, count). count must be > 0. */
export function winnerIndex(
  serverSeed: string,
  entriesHashHex: string,
  nonce: number,
  count: number
): number {
  const hmac = createHmac("sha256", serverSeed).update(`${entriesHashHex}:${nonce}`).digest("hex");
  // 13 hex chars = 52 bits, safely within Number's integer range.
  const n = parseInt(hmac.slice(0, 13), 16);
  return n % count;
}
