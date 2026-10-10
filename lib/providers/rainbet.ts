import "server-only";
import type { WagerProvider, WagerFetchResult } from "./types";

// Rainbet affiliate provider — ported from JBALLIN lib/rainbet.ts with its
// exact per-code error handling (CLAUDE.md spec). Server-only: RAINBET_API_KEY
// goes in the query string, so any client fetch would leak it in DevTools
// (golden rules 1–2).
//
// `wagered_amount` is a decimal string at full precision. If the key has
// `target_edge` configured it is a *weighted* wager — the rules page explains
// that trap with a worked example; we store exactly what the API returns.

const BASE_URL = "https://services.rainbet.com";
const MAX_RANGE_DAYS = 123;

type RainbetErrorCode =
  | "er_missing_parameters"
  | "er_invalid_date_format"
  | "er_start_at_parameter_invalid"
  | "er_end_at_parameter_invalid"
  | "er_end_at_parameter_within_4_month"
  | "er_invalid_key"
  | "er_invalid_target_edge_configuration"
  | "er_unexpected_response";

interface RainbetAffiliate {
  username: string;
  id: string;
  wagered_amount: string;
}
interface RainbetResponse {
  affiliates: RainbetAffiliate[];
  cache_updated_at: string;
}

function daysBetween(startAt: string, endAt: string): number {
  const start = new Date(`${startAt}T00:00:00Z`);
  const end = new Date(`${endAt}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export const rainbetProvider: WagerProvider = {
  name: "rainbet",

  async fetchWagers(startAt, endAt): Promise<WagerFetchResult> {
    const apiKey = process.env.RAINBET_API_KEY;
    if (!apiKey) throw new Error("RAINBET_API_KEY is not set");

    if (daysBetween(startAt, endAt) > MAX_RANGE_DAYS) {
      return { ok: false, errorCode: "er_end_at_parameter_within_4_month", status: 400 };
    }

    const url = new URL("/v1/external/affiliates", BASE_URL);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("start_at", startAt);
    url.searchParams.set("end_at", endAt);

    const res = await fetch(url, { cache: "no-store" });

    if (res.status === 200) {
      const data = (await res.json()) as RainbetResponse;
      return {
        ok: true,
        rows: data.affiliates.map((a) => ({
          id: a.id,
          username: a.username,
          wagered: a.wagered_amount,
        })),
        cacheUpdatedAt: data.cache_updated_at ?? null,
      };
    }

    if (res.status === 400 || res.status === 500) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const known: RainbetErrorCode[] = [
        "er_missing_parameters",
        "er_invalid_date_format",
        "er_start_at_parameter_invalid",
        "er_end_at_parameter_invalid",
        "er_end_at_parameter_within_4_month",
        "er_invalid_key",
        "er_invalid_target_edge_configuration",
      ];
      const code = (known as string[]).includes(body.error ?? "")
        ? (body.error as RainbetErrorCode)
        : "er_unexpected_response";
      return { ok: false, errorCode: code, status: res.status };
    }

    return { ok: false, errorCode: "er_unexpected_response", status: res.status };
  },
};
