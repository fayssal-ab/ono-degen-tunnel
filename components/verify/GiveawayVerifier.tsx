"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

// Independently recomputes a giveaway draw in the browser with Web Crypto,
// using the exact algorithm in lib/fair.ts. If every check passes, the draw
// was not rigged: the seed matches its pre-published hash, the entrant list
// matches its hash, and each winner falls out of HMAC(seed, entriesHash:nonce).

interface Props {
  serverSeedHash: string;
  serverSeed: string | null;
  entrants: string[];
  winners: { username: string; nonce: number; index: number; entriesHash: string }[];
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

export function GiveawayVerifier({ serverSeedHash, serverSeed, entrants, winners }: Props) {
  const [checks, setChecks] = useState<Check[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!serverSeed) return;
      const out: Check[] = [];

      const computedHash = await sha256Hex(serverSeed);
      out.push({
        label: "Server seed matches the hash committed before the draw",
        ok: computedHash === serverSeedHash,
        detail: `SHA256(seed) = ${computedHash.slice(0, 16)}…`,
      });

      const eHash = await sha256Hex(entrants.map((e) => e.toLowerCase()).join("\n"));
      const expectedEHash = winners[0]?.entriesHash;
      out.push({
        label: `Entrant list (${entrants.length}) matches its hash`,
        ok: !expectedEHash || eHash === expectedEHash,
        detail: `entries_hash = ${eHash.slice(0, 16)}…`,
      });

      for (const w of winners) {
        const hex = await hmacHex(serverSeed, `${eHash}:${w.nonce}`);
        const idx = parseInt(hex.slice(0, 13), 16) % entrants.length;
        const nameAtIdx = entrants[idx];
        const ok = idx === w.index && nameAtIdx?.toLowerCase() === w.username.toLowerCase();
        out.push({
          label: `Winner "${w.username}" (nonce ${w.nonce}) → index ${idx}`,
          ok,
          detail: `HMAC → ${hex.slice(0, 13)} → #${idx}`,
        });
      }

      if (!cancelled) setChecks(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [serverSeed, serverSeedHash, entrants, winners]);

  if (!serverSeed) {
    return (
      <div className="surface flex items-center gap-3 p-5 text-sm text-text-1">
        <Icon name="Clock" className="h-5 w-5 text-text-2" />
        This giveaway hasn&rsquo;t been drawn yet. The seed is revealed here the moment it is — until
        then only its hash is public, which is what makes the draw tamper-proof.
      </div>
    );
  }

  if (!checks) return <div className="surface p-5 text-sm text-text-2">Recomputing in your browser…</div>;

  const allOk = checks.every((c) => c.ok);
  return (
    <div className="space-y-3">
      <div className={`surface flex items-center gap-3 p-5 ${allOk ? "gold-border" : ""}`}>
        <Icon name={allOk ? "ShieldCheck" : "ShieldAlert"} className={`h-6 w-6 ${allOk ? "text-volt" : "text-danger"}`} />
        <div>
          <p className="font-medium text-text-0">{allOk ? "Verified — this draw is legit" : "Verification failed"}</p>
          <p className="text-xs text-text-2">Recomputed entirely in your browser from the published seed.</p>
        </div>
      </div>
      <ul className="surface divide-y divide-line overflow-hidden">
        {checks.map((c, i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-3">
            <Icon name={c.ok ? "Check" : "X"} className={`mt-0.5 h-4 w-4 shrink-0 ${c.ok ? "text-volt" : "text-danger"}`} />
            <div className="min-w-0">
              <p className="text-sm text-text-0">{c.label}</p>
              {c.detail && <p className="truncate font-mono text-xs text-text-2">{c.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
