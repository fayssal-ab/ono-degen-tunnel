import "server-only";
import type { WagerProvider } from "./types";
import { demoProvider } from "./demo";
import { manualProvider } from "./manual";

export type { WagerProvider, WagerRow, WagerFetchResult } from "./types";

// Picks the provider from CASINO_PROVIDER. Adding a new casino later = one new
// file + one line here (prompt §6). Defaults to `manual` so a fresh install
// shows NO fabricated data — the board stays empty until wagers are uploaded
// via the admin CSV.
// The `demo` provider still exists but is opt-in only (CASINO_PROVIDER=demo)
// for local UI testing — it is never the default.
export function getWagerProvider(): WagerProvider {
  const name = (process.env.CASINO_PROVIDER ?? "manual").toLowerCase();
  switch (name) {
    case "manual":
      return manualProvider;
    case "demo":
      return demoProvider;
    default:
      throw new Error(`Unknown CASINO_PROVIDER "${name}" (expected manual|demo)`);
  }
}

/** True only when explicitly running the opt-in demo provider. */
export function isDemoMode(): boolean {
  return (process.env.CASINO_PROVIDER ?? "manual").toLowerCase() === "demo";
}
