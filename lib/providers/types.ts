import "server-only";

// A single wager row from whatever casino is wired in. `wagered` is a DECIMAL
// STRING at full precision — never parse it to a JS float (golden rule 7).
// `id` is the stable key; `username` can change and must be refreshed each sync.
export interface WagerRow {
  id: string;
  username: string;
  wagered: string;
}

export interface WagerFetchSuccess {
  ok: true;
  rows: WagerRow[];
  /** Provider-reported cache timestamp, surfaced in the UI ("updated X ago"). */
  cacheUpdatedAt: string | null;
}

export interface WagerFetchFailure {
  ok: false;
  /** Stable code stored in sync_log; keep provider error codes intact. */
  errorCode: string;
  status: number;
}

export type WagerFetchResult = WagerFetchSuccess | WagerFetchFailure;

export interface WagerProvider {
  readonly name: string;
  /** start/end are inclusive YYYY-MM-DD (casino APIs are date-granular). */
  fetchWagers(startAt: string, endAt: string): Promise<WagerFetchResult>;
}
