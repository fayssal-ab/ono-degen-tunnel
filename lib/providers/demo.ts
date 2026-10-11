import "server-only";
import type { WagerProvider, WagerFetchResult, WagerRow } from "./types";

// Deterministic demo provider for local dev and previews (prompt §6). No
// network, no keys. Given the same date window it returns the same board, but
// amounts grow smoothly with how far into the window "today" is, so the board
// looks alive across syncs without ever being random.

const HANDLES = [
  "tunnelrat", "goldrush88", "degendan", "voltqueen", "nightcrawler", "plasmapete",
  "wagerwolf", "slotsultan", "neonnomad", "boxbaron", "crit_hit", "spincycle",
  "highroller_hz", "luckylattice", "midnight_mia", "echochamber", "turbotom",
  "frostbyte", "ace_of_void", "glitchgod", "sernik", "mango_mob", "zephyr_z",
  "cashmere_cat", "static_sam", "obsidian_o", "rift_rider", "paydaypaul",
  "quasar_q", "velvet_v", "hollowpoint", "sunkencity", "amberalert_",
  "byte_me", "gravywell", "nova_knox", "pixel_pilot", "run_it_back", "zenith_z",
  "coldfusion", "lumen_lux", "tidal_t", "ember_e", "cascade_c",
];

// FNV-1a — a stable, fast hash for seeding per-user amounts from their id.
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const demoProvider: WagerProvider = {
  name: "demo",
  // Deterministic generator: every handle is always present.
  listsAllWagerers: true,

  async fetchWagers(startAt, endAt): Promise<WagerFetchResult> {
    const start = new Date(`${startAt}T00:00:00Z`).getTime();
    const end = new Date(`${endAt}T23:59:59Z`).getTime();
    const now = Date.now();
    // How far through the window we are (0..1), clamped. Past windows = full.
    const progress = Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));

    const rows: WagerRow[] = HANDLES.map((username, i) => {
      const id = `demo_${hash(username).toString(16)}`;
      const seed = hash(id);
      // A heavy-tailed cap so #1 towers over the pack, like a real board.
      const cap = 2000 + (seed % 100) ** 2 * 85; // ~2k .. ~850k
      const curve = Math.pow(progress, 1 + (seed % 7) / 10); // each ramps differently
      const jitter = 0.85 + ((seed >> 8) % 30) / 100;
      const wagered = Math.round(cap * curve * jitter * (1 - i * 0.004));
      return { id, username, wagered: Math.max(0, wagered).toFixed(8) };
    });

    return { ok: true, rows, cacheUpdatedAt: new Date().toISOString().slice(0, 19).replace("T", " ") };
  },
};
