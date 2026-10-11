"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

interface GiveawayOpt {
  id: number;
  title: string;
  status: string;
  entrants: number;
}

const input = "h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none";

export function GiveawayAdminBar({ giveaways, selectedId }: { giveaways: GiveawayOpt[]; selectedId: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function select(id: string) {
    router.push(`/admin/giveaways?g=${id}`);
  }

  async function remove() {
    if (selectedId == null) return;
    if (!confirm("Delete this giveaway permanently? Entries and winners are removed too.")) return;
    try {
      const res = await fetch(`/api/admin/giveaways/${selectedId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/admin/giveaways");
      router.refresh();
    } catch {
      setErr("Couldn't delete the giveaway.");
    }
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/giveaways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fd.get("title"),
          prize: fd.get("prize"),
          keyword: fd.get("keyword"),
          entry_condition: fd.get("entry_condition"),
          subscribers_only: fd.get("subscribers_only") === "on",
          ends_at: fd.get("ends_at") ? new Date(String(fd.get("ends_at"))).toISOString() : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const { id } = await res.json();
      setOpen(false);
      router.push(`/admin/giveaways?g=${id}`);
      router.refresh();
    } catch {
      setErr("Couldn't create the giveaway.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Icon name="Gift" className="h-5 w-5 text-gold" />
          <span className="font-display text-sm font-bold tracking-wide">Giveaways</span>
        </div>

        {giveaways.length > 0 && (
          <div className="relative">
            <select
              value={selectedId ?? ""}
              onChange={(e) => select(e.target.value)}
              className="h-10 appearance-none rounded-xl border border-line bg-bg-1 pl-3 pr-9 text-sm text-text-0 focus:border-gold focus:outline-none"
            >
              {giveaways.map((g) => (
                <option key={g.id} value={g.id}>
                  #{g.id} · {g.title} ({g.status})
                </option>
              ))}
            </select>
            <Icon name="ChevronDown" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-2" />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {selectedId != null && (
            <button
              onClick={remove}
              className="press inline-flex h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm text-text-2 transition-colors hover:border-danger hover:text-danger"
              title="Delete this giveaway"
            >
              <Icon name="Trash2" className="h-4 w-4" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}
          <button
            onClick={() => setOpen(true)}
            className="press inline-flex h-10 items-center gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-bg-0 hover:bg-gold-hi"
          >
            <Icon name="Plus" className="h-4 w-4" /> New giveaway
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[115] flex items-start justify-center overflow-y-auto p-4 pt-[8vh]">
          <button className="absolute inset-0 bg-bg-0/80 backdrop-blur-md" aria-label="Close" onClick={() => setOpen(false)} />
          <form onSubmit={create} className="pop-in surface relative w-full max-w-lg space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">New giveaway</h2>
              <button type="button" onClick={() => setOpen(false)} className="press grid h-8 w-8 place-items-center rounded-lg text-text-2 hover:bg-bg-3 hover:text-text-0">
                <Icon name="X" className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-text-2">Entries come from Kick chat — viewers type the keyword while you&rsquo;re live. The draw is provably fair.</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="label">Title</span><input name="title" className={`mt-1 ${input}`} placeholder="Weekend $250 drop" /></label>
              <label className="block"><span className="label">Prize</span><input name="prize" className={`mt-1 ${input}`} placeholder="$250" /></label>
              <label className="block"><span className="label">Chat keyword</span><input name="keyword" defaultValue="!win" className={`mt-1 ${input}`} /></label>
              <label className="block"><span className="label">Ends at (optional)</span><input name="ends_at" type="datetime-local" className={`mt-1 ${input}`} /></label>
              <label className="block sm:col-span-2"><span className="label">Entry condition (shown to viewers)</span><input name="entry_condition" className={`mt-1 ${input}`} placeholder="Type !win in Kick chat while live" /></label>
              <label className="flex items-center gap-2 text-sm text-text-1 sm:col-span-2"><input type="checkbox" name="subscribers_only" className="h-4 w-4" /> Subscribers only</label>
            </div>

            {err && <p className="text-sm text-danger">{err}</p>}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setOpen(false)} className="press inline-flex h-11 items-center rounded-xl border border-line px-5 text-sm text-text-1 hover:text-text-0">Cancel</button>
              <button type="submit" disabled={saving} className="press inline-flex h-11 items-center gap-2 rounded-xl bg-gold px-5 text-sm font-semibold text-bg-0 hover:bg-gold-hi disabled:opacity-50">
                {saving ? "Creating…" : <>Create & open</>}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
