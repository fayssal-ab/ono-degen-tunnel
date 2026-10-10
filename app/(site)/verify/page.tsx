import type { Metadata } from "next";
import Link from "next/link";
import { getPastWinners } from "@/lib/giveaways";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { VerifyLookup } from "@/components/verify/VerifyLookup";

export const metadata: Metadata = {
  title: "Provably fair",
  description: "Every giveaway draw is provably fair and independently verifiable.",
};
export const dynamic = "force-dynamic";

export default async function VerifyIndexPage() {
  const winners = await getPastWinners(60);
  // distinct verifiable giveaways, newest first
  const seen = new Set<number>();
  const draws = winners.filter((w) => w.verifiable && !seen.has(w.giveaway_id) && seen.add(w.giveaway_id));

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Provably fair"
        title="Verify a giveaway"
        lead="Every draw is committed to a sealed random seed before anyone enters, then revealed after. Recompute any result yourself — no trust required."
        right={<Icon name="ShieldCheck" className="h-8 w-8 text-plasma" />}
      />

      <section className="surface p-6">
        <h2 className="text-lg">Look up a draw</h2>
        <p className="mt-1 text-sm text-text-2">Enter a giveaway&rsquo;s ID (shown on each winner&rsquo;s “Verify” link).</p>
        <div className="mt-4 max-w-md">
          <VerifyLookup />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg">Recent verified draws</h2>
        {draws.length === 0 ? (
          <p className="surface p-6 text-sm text-text-1">No draws yet. Verified giveaways will be listed here.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {draws.map((w) => (
              <Link key={w.giveaway_id} href={`/verify/${w.giveaway_id}`} className="surface press block p-5 hover:border-plasma">
                <p className="text-sm text-text-0">{w.giveaway_title}</p>
                <p className="mt-1 text-xs text-text-2">Winner {w.username} · {w.prize}</p>
                <p className="mt-3 inline-flex items-center gap-1 text-xs text-plasma">
                  <Icon name="ShieldCheck" className="h-3.5 w-3.5" /> Verify draw #{w.giveaway_id}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="surface space-y-2 p-6 text-sm text-text-1">
        <h2 className="text-lg text-text-0">Why you can trust it</h2>
        <p>The winning seed&rsquo;s hash is published the moment a giveaway opens — before a single entry. We physically can&rsquo;t change the seed afterwards without the hash no longer matching.</p>
        <p>When the draw happens, the full entrant list and the seed are revealed, and the winner is derived by a fixed formula. The verifier recomputes everything in your browser, so you&rsquo;re not trusting us — you&rsquo;re checking the math.</p>
      </section>
    </div>
  );
}
