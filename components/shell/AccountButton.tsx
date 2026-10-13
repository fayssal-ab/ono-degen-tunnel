"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

// Viewer account in the top bar. Read client-side from /api/me so public
// pages stay cacheable; re-read on navigation (sign-in lands on /account).
type Me = { name: string; avatar: string } | null;

export function AccountButton() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ user: Me }>)
      .then((d) => { if (alive) setMe(d.user); })
      .catch(() => { if (alive) setMe(null); });
    return () => { alive = false; };
  }, [pathname]);

  if (me === undefined) return <span className="h-10 w-10 shrink-0 rounded-xl border border-line bg-bg-1" aria-hidden />;
  if (!me) {
    return (
      <Link href="/account" className="press inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-line-strong bg-bg-1 px-3 text-sm font-semibold text-text-0 hover:border-gold hover:text-gold" aria-label="Log in">
        <Icon name="LogIn" className="h-4 w-4" />
        <span className="hidden md:inline">Log in</span>
      </Link>
    );
  }
  return (
    <Link href="/account" className="press inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-line bg-bg-1 pl-1 pr-1 hover:border-gold md:pr-3" aria-label={`Your account (${me.name})`}>
      <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg bg-bg-3 text-sm font-bold text-gold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {me.avatar ? <img src={me.avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : me.name[0]?.toUpperCase()}
      </span>
      <span className="hidden max-w-[10ch] truncate text-sm font-semibold text-text-0 md:inline">{me.name}</span>
    </Link>
  );
}
