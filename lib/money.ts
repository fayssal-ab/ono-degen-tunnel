import Decimal from "decimal.js";

// All money arithmetic goes through decimal.js — never a JS float (golden
// rule 7). Values are stored and passed around as decimal strings; this module
// is the only place that interprets them numerically.

// 8 dp matches DECIMAL(20,8) in the schema.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function d(value: string | number | Decimal): Decimal {
  return new Decimal(value || 0);
}

/** Sum a list of decimal strings, returning a decimal string. */
export function sumDecimals(values: Array<string | number>): string {
  return values.reduce((acc: Decimal, v) => acc.plus(d(v)), new Decimal(0)).toFixed(8);
}

/** prizePool * percentage/100, as a decimal string at 2dp (payout precision). */
export function prizeForPercentage(prizePool: string, percentage: number): string {
  return d(prizePool).mul(d(percentage)).div(100).toFixed(2);
}

/** a - b, as a decimal string (used for race/snapshot diffs). Never negative. */
export function diffDecimals(a: string, b: string): string {
  const r = d(a).minus(d(b));
  return r.isNegative() ? "0.00000000" : r.toFixed(8);
}

/** "$1,234.56" — presentation only. Accepts a decimal string. */
export function formatMoney(value: string | number, opts?: { cents?: boolean }): string {
  const n = d(value);
  const fractionDigits = opts?.cents === false ? 0 : 2;
  return (
    "$" +
    n.toNumber().toLocaleString("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
  );
}

/** Compact money for tight spots: $1.2M / $12.5k / $920. */
export function formatMoneyCompact(value: string | number): string {
  const n = d(value).toNumber();
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "k";
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** "$X more" between two decimal strings, for the find-me gap message. */
export function gapTo(target: string, current: string): string {
  return formatMoney(diffDecimals(target, current));
}
