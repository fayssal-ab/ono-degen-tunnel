// Payout destinations, shared by the browser forms, the API and the Discord
// claim flow so every place accepts exactly the same values: a Stake username,
// or a USDC wallet on Ethereum (ERC-20). Older claims may still say 'rainbet',
// 'other' or another USDC network — those are only ever displayed.

export type PayoutMethod = "stake" | "usdc";
export const PAYOUT_METHODS: PayoutMethod[] = ["stake", "usdc"];
export const PAYOUT_LABEL: Record<string, string> = { stake: "Stake", usdc: "USDC wallet", rainbet: "Rainbet", other: "Other" };

/** The one network USDC is paid on. */
export const USDC_NETWORK = "ERC20";
export const USDC_HINT = "0x… (Ethereum)";
const LEGACY_NETWORKS: Record<string, string> = {
  ERC20: "Ethereum", BEP20: "BNB Chain", POLYGON: "Polygon", BASE: "Base", ARBITRUM: "Arbitrum", SOL: "Solana", TRC20: "Tron",
};
export const networkLabel = (n: string) => LEGACY_NETWORKS[n] ?? n;

const EVM = /^0x[0-9a-fA-F]{40}$/;
/** Stake usernames: letters, digits, _ . - (3–32). */
const STAKE_USER = /^[A-Za-z0-9_.-]{3,32}$/;

export interface Destination { method: PayoutMethod; value: string; network: typeof USDC_NETWORK | "" }

/** Normalised destination, or a reason it's refused (shown to the user as is). */
export function checkDestination(method: string, rawValue: string): { ok: true; dest: Destination } | { ok: false; error: string } {
  const value = rawValue.trim();
  if (method === "stake") {
    if (!value) return { ok: false, error: "Enter your Stake username." };
    if (!STAKE_USER.test(value)) return { ok: false, error: "That doesn't look like a Stake username (3–32 letters, numbers, _ . -)." };
    return { ok: true, dest: { method, value, network: "" } };
  }
  if (method === "usdc") {
    if (!value) return { ok: false, error: "Enter your USDC wallet address." };
    if (!EVM.test(value)) return { ok: false, error: "That isn't a valid Ethereum address (0x + 40 characters)." };
    return { ok: true, dest: { method, value, network: USDC_NETWORK } };
  }
  return { ok: false, error: "Pick Stake or a USDC wallet." };
}

/** "Stake · ono123" / "USDC · 0x52…" */
export function describeDestination(method: string | null, value: string, network = ""): string {
  if (!method) return "—";
  const label = method === "usdc" ? (network && network !== USDC_NETWORK ? `USDC (${networkLabel(network)})` : "USDC") : PAYOUT_LABEL[method] ?? method;
  return `${label} · ${value}`;
}
