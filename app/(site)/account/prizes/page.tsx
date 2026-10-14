import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Icon } from "@/components/ui/Icon";
import { PrizeDesk, type PrizeRow, type Wallets } from "@/components/account/PrizeDesk";
import { listOwnedAwards } from "@/lib/prizes";
import { currentAccountId, getAccount, markNotificationsSeen, prizeOwner, type AccountSummary } from "@/lib/userAuth";

export const metadata: Metadata = { title: "My prizes", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MyPrizesPage() {
  let account: AccountSummary | null = null;
  let prizes: PrizeRow[] = [];
  let down = false;
  try {
    const id = await currentAccountId();
    account = id != null ? await getAccount(id) : null;
    const owner = account ? prizeOwner(account) : null;
    if (account && owner) {
      prizes = (await listOwnedAwards(owner)) as unknown as PrizeRow[];
      // opening the desk reads the prize notifications
      if (prizes.length) await markNotificationsSeen(account.id).catch(() => {});
    }
  } catch { down = true; }

  const header = <PageHeader kicker="Account" title="My prizes" watermark="PRIZES" accent="gold" icon="Trophy" iconColor="gold"
    lead="Everything you won on stream: claim it, follow it, get paid." />;

  if (down) {
    return <div className="space-y-8">{header}<p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">Prizes are temporarily unavailable. Try again in a moment.</p></div>;
  }
  if (!account) {
    return (
      <div className="space-y-8">
        {header}
        <div className="surface mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
          <Icon name="Lock" className="h-8 w-8 text-gold" />
          <p className="text-sm text-text-1">Sign in with Kick or Discord to see and claim your prizes.</p>
          <Link href="/account" className="press inline-flex h-11 items-center gap-2 rounded-xl bg-gold px-5 text-sm font-bold text-bg-0 hover:bg-gold-hi"><Icon name="LogIn" className="h-4 w-4" /> Sign in</Link>
        </div>
      </div>
    );
  }

  const wallets: Wallets = {
    preferred: account.payout_method, stake: account.stake_username, rainbet: account.rainbet_username,
    usdc: account.usdc_address, network: account.usdc_network,
  };
  const linked = new Set(account.identities.map((i) => i.provider));
  return (
    <div className="space-y-8">
      {header}
      {(!linked.has("kick") || !linked.has("discord")) && (
        <Link href="/account#linked" className="flex items-center gap-3 rounded-2xl border border-line bg-bg-1 p-4 text-sm text-text-1 hover:border-gold/50">
          <BrandIcon brand={linked.has("kick") ? "discord" : "kick"} className="h-5 w-5" />
          <span className="flex-1">Link your {linked.has("kick") ? "Discord" : "Kick"} too — prizes won with either account show up here.</span>
          <Icon name="ArrowRight" className="h-4 w-4 text-gold" />
        </Link>
      )}
      <PrizeDesk prizes={prizes} wallets={wallets} guildId={process.env.DISCORD_GUILD_ID ?? null} />
    </div>
  );
}
