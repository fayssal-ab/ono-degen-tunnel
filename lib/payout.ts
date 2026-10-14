// Payout destinations, shared by the browser forms, the API and the Discord
// claim flow so every place accepts exactly the same values. Each method is
// validated on its own: Stake / Rainbet usernames, or a USDC address checked
// against the chosen network's address format.

export type PayoutMethod = "stake" | "rainbet" | "usdc";
export const PAYOUT_METHODS: PayoutMethod[] = ["stake", "rainbet", "usdc"];
/** 'other' only exists on older claims. */
export const PAYOUT_LABEL: Record<PayoutMethod | "other", string> = { stake: "Stake", rainbet: "Rainbet", usdc: "USDC wallet", other: "Other" };

export type UsdcNetwork = "ERC20" | "BEP20" | "POLYGON" | "BASE" | "ARBITRUM" | "SOL" | "TRC20";
const EVM = /^0x[0-9a-fA-F]{40}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
export const USDC_NETWORKS: { id: UsdcNetwork; label: string; hint: string; valid: (a: string) => boolean }[] = [
  { id: "ERC20", label: "Ethereum (ERC-20)", hint: "0x…", valid: (a) => EVM.test(a) },
  { id: "BEP20", label: "BNB Chain (BEP-20)", hint: "0x…", valid: (a) => EVM.test(a) },
  { id: "POLYGON", label: "Polygon", hint: "0x…", valid: (a) => EVM.test(a) },
  { id: "BASE", label: "Base", hint: "0x…", valid: (a) => EVM.test(a) },
  { id: "ARBITRUM", label: "Arbitrum One", hint: "0x…", valid: (a) => EVM.test(a) },
  { id: "SOL", label: "Solana", hint: "base58, 32–44 characters", valid: (a) => BASE58.test(a) && a.length >= 32 && a.length <= 44 },
  { id: "TRC20", label: "Tron (TRC-20)", hint: "T…, 34 characters", valid: (a) => /^T/.test(a) && BASE58.test(a) && a.length === 34 },
];
export const networkLabel = (n: string) => USDC_NETWORKS.find((x) => x.id === n)?.label ?? n;

/** Casino usernames: letters, digits, _ . - (3–32). */
const CASINO_USER = /^[A-Za-z0-9_.-]{3,32}$/;

export interface Destination { method: PayoutMethod; value: string; network: UsdcNetwork | "" }

/** Normalised destination, or a reason it's refused (shown to the user as is). */
export function checkDestination(method: string, rawValue: string, rawNetwork = ""): { ok: true; dest: Destination } | { ok: false; error: string } {
  const value = rawValue.trim();
  if (method === "stake" || method === "rainbet") {
    const name = PAYOUT_LABEL[method];
    if (!value) return { ok: false, error: `Enter your ${name} username.` };
    if (!CASINO_USER.test(value)) return { ok: false, error: `That doesn't look like a ${name} username (3–32 letters, numbers, _ . -).` };
    return { ok: true, dest: { method, value, network: "" } };
  }
  if (method === "usdc") {
    const net = USDC_NETWORKS.find((n) => n.id === rawNetwork.trim().toUpperCase());
    if (!net) return { ok: false, error: "Pick the network of your USDC wallet." };
    if (!value) return { ok: false, error: "Enter your USDC wallet address." };
    if (!net.valid(value)) return { ok: false, error: `That isn't a valid ${net.label} address (${net.hint}).` };
    return { ok: true, dest: { method, value, network: net.id } };
  }
  return { ok: false, error: "Pick Stake, Rainbet or a USDC wallet." };
}

/** "Stake · ono123" / "USDC (Solana) · 7xKX…" */
export function describeDestination(method: string | null, value: string, network = ""): string {
  if (!method) return "—";
  const label = method === "usdc" ? `USDC (${networkLabel(network)})` : PAYOUT_LABEL[method as PayoutMethod] ?? method;
  return `${label} · ${value}`;
}
