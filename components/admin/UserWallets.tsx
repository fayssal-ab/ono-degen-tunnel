import type { ReactNode } from "react";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Icon } from "@/components/ui/Icon";
import { networkLabel } from "@/lib/payout";
import type { UserRow } from "@/lib/userAdmin";

/** Saved payout wallets, one chip each (⭐ = the default). */
export function UserWallets({ u }: { u: Pick<UserRow, "payout_method" | "stake_username" | "usdc_address" | "usdc_network"> }) {
  const items = [
    u.stake_username && { m: "stake", node: <><BrandIcon brand="stake" className="h-3.5 w-3.5" />{u.stake_username}</> },
    u.usdc_address && { m: "usdc", node: <><span className="rounded bg-[#2775CA] px-1 text-[9px] font-bold text-white">USDC</span><span title={u.usdc_address}>{u.usdc_address.slice(0, 6)}…{u.usdc_address.slice(-4)}</span><span className="text-text-2">{networkLabel(u.usdc_network)}</span></> },
  ].filter(Boolean) as { m: string; node: ReactNode }[];
  if (!items.length) return <span className="text-text-2">—</span>;
  return (
    <span className="flex flex-col gap-1">
      {items.map((it) => (
        <span key={it.m} className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-[11px] ${u.payout_method === it.m ? "border-gold/50 text-text-0" : "border-line text-text-1"}`}>
          {u.payout_method === it.m && <Icon name="Star" className="h-3 w-3 fill-gold text-gold" />}{it.node}
        </span>
      ))}
    </span>
  );
}
