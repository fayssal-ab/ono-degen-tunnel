import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getVerification } from "@/lib/giveaways";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { GiveawayVerifier } from "@/components/verify/GiveawayVerifier";

export const metadata: Metadata = { title: "Verify draw", robots: { index: false } };
export const dynamic = "force-dynamic";

function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className={`mt-1 break-all text-sm text-text-1 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );
}

export default async function VerifyDrawPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const giveawayId = Number(id);
  if (!Number.isInteger(giveawayId)) notFound();

  const v = await getVerification(giveawayId);
  if (!v) notFound();

  return (
    <div className="space-y-8">
      <Link href="/verify" className="inline-flex items-center gap-1 text-sm text-text-1 hover:text-text-0">
        <Icon name="ChevronLeft" className="h-4 w-4" /> How verification works
      </Link>

      <PageHeader
        kicker="Provably fair"
        title={`Verify: ${v.giveaway.title}`}
        lead={`Prize: ${v.giveaway.prize}`}
        right={<Badge tone={v.serverSeed ? "volt" : "neutral"}>{v.serverSeed ? "Drawn" : "Pending"}</Badge>}
      />

      {/* the live recompute */}
      <GiveawayVerifier
        serverSeedHash={v.serverSeedHash}
        serverSeed={v.serverSeed}
        entrants={v.entrants}
        winners={v.winners}
      />

      {/* raw inputs */}
      <section className="surface space-y-4 p-6">
        <h2 className="text-lg">Published inputs</h2>
        <Field label="Server seed hash (committed before the draw)" value={v.serverSeedHash} />
        <Field label="Server seed (revealed after the draw)" value={v.serverSeed ?? "not revealed yet"} />
        <div>
          <p className="label">Entrants ({v.entrants.length}) — in draw order</p>
          {v.entrants.length === 0 ? (
            <p className="mt-1 text-sm text-text-2">No entrants recorded.</p>
          ) : (
            <ol className="mt-2 grid max-h-64 grid-cols-2 gap-x-6 gap-y-1 overflow-y-auto sm:grid-cols-3">
              {v.entrants.map((name, i) => (
                <li key={i} className="flex gap-2 font-mono text-xs text-text-1">
                  <span className="text-text-2">{i}</span>
                  <span className="truncate">{name}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* method */}
      <section className="surface space-y-2 p-6 text-sm text-text-1">
        <h2 className="text-lg text-text-0">The method</h2>
        <p>1. A random <span className="font-mono">server seed</span> is generated when the giveaway is created, and only its <span className="font-mono">SHA-256</span> hash is published — so the seed is locked in before anyone knows who will enter.</p>
        <p>2. At draw time the ordered entrant list is hashed: <span className="font-mono">entries_hash = SHA256(name₀\nname₁\n…)</span>.</p>
        <p>3. Each winner index = <span className="font-mono">HMAC_SHA256(seed, entries_hash:nonce)</span>, first 13 hex digits → integer → mod entrant count. <span className="font-mono">nonce</span> counts up per winner.</p>
        <p>4. The seed is revealed. The check above re-runs all of this in your browser — if it matches, the result could not have been tampered with.</p>
      </section>
    </div>
  );
}
