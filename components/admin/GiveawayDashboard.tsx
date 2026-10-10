"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

// Kick giveaway control panel — same layout/workflow as the reference tool
// (keyword bar + listen, platform buttons, filter pills, avatar reel with a
// center indicator, big roll button, entries list, winner modal) but in the
// ONO look: dark + gold + volt, rounded, real fonts. No pixel/Minecraft.
//
// Entries are REAL (Kick webhook → DB, polled here). The winner is chosen
// server-side (provably fair) before the reel plays; the reel only presents it.

interface Entry {
  username: string;
  avatar: string | null;
  platform: "kick";
  isSubscriber: boolean;
  excluded: boolean;
  createdAt: string;
}
interface Winner {
  username: string;
  avatar: string | null;
  platform: string;
}
interface Data {
  giveaway: { id: number; title: string; prize: string; status: string; keyword: string | null; subscribersOnly: boolean };
  kickConfigured: boolean;
  entries: Entry[];
  eligibleCount: number;
  winners: { username: string; avatar: string | null }[];
}

// ── WebAudio SFX (no asset files) ──
let actx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    actx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return actx;
  } catch {
    return null;
  }
}
function tick(muted: boolean) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "square";
  o.frequency.value = 300;
  g.gain.value = 0.03;
  o.connect(g);
  g.connect(a.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.05);
  o.stop(a.currentTime + 0.06);
}
function chime(muted: boolean) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  [523, 659, 784, 1047].forEach((f, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const t = a.currentTime + i * 0.09;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + 0.45);
  });
}

function Avatar({ src, name, size = 44 }: { src: string | null; name: string; size?: number }) {
  if (src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="h-full w-full rounded-full object-cover" />;
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <span
      className="grid h-full w-full place-items-center rounded-full font-display font-bold text-bg-0"
      style={{ background: "linear-gradient(135deg, var(--color-gold), var(--color-gold-hi))", fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}

const CARD = 136;

const FILTERS = [
  { key: "subs", label: "Subscribers", available: true },
  { key: "mods", label: "Mods", available: false },
  { key: "vips", label: "VIPs", available: false },
  { key: "gifters", label: "Gifters", available: false },
  { key: "yapper", label: "Yapper", available: false },
  { key: "super", label: "Super Yapper", available: false },
];

export function GiveawayDashboard({ id, initial, defaultChannel }: { id: number; initial: Data; defaultChannel: string }) {
  const [data, setData] = useState<Data>(initial);
  const [channel, setChannel] = useState(defaultChannel);
  const [channelDraft, setChannelDraft] = useState(defaultChannel);

  // remember the last channel used for testing (per browser)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("odt.giveaway.channel");
      if (saved) {
        setChannel(saved);
        setChannelDraft(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);
  function applyChannel(next: string) {
    const c = next.trim().toLowerCase().replace(/^https?:\/\/(www\.)?kick\.com\//, "").replace(/\/.*$/, "");
    if (!c) return;
    setChannel(c);
    setChannelDraft(c);
    try {
      localStorage.setItem("odt.giveaway.channel", c);
    } catch {
      /* ignore */
    }
  }
  const [spinning, setSpinning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [modalWinner, setModalWinner] = useState<Winner | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<"off" | "connecting" | "connected" | "error">("off");

  const stripRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const reelRef = useRef<Entry[]>([]);
  const spinningRef = useRef(false);

  const g = data.giveaway;
  const listening = g.status === "open";
  const eligible = data.entries.filter((e) => !e.excluded);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/giveaways/${id}/entries`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => {
      if (!spinningRef.current) refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  // Live Kick chat reader. While the giveaway is open, connect to Kick's public
  // chat socket in the browser, match the keyword, and record real entries.
  // Unofficial (Kick publishes no chat API) but works locally and in prod with
  // no OAuth/webhook. See lib/kickChat.ts.
  useEffect(() => {
    if (!listening) {
      setLiveStatus("off");
      return;
    }
    let ws: WebSocket | null = null;
    let closedByUs = false;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        refresh();
      }, 1200);
    };

    interface PusherMsg { event: string; data: string }
    interface ChatPayload { content?: string; sender?: { username?: string; identity?: { badges?: { type?: string }[] } } }

    async function connect() {
      setLiveStatus("connecting");
      let info: {
        ok?: boolean;
        wsUrl?: string;
        socketChannel?: string;
        chatEvent?: string;
        keyword?: string | null;
      } | null = null;
      try {
        const res = await fetch(`/api/admin/giveaways/${id}/listen-info?channel=${encodeURIComponent(channel)}`, { cache: "no-store" });
        info = await res.json();
      } catch {
        info = null;
      }
      if (!info?.ok || !info.wsUrl) {
        setLiveStatus("error");
        if (!closedByUs) reconnect = setTimeout(connect, 5000);
        return;
      }
      const { wsUrl, socketChannel, chatEvent } = info;
      const kw = (info.keyword ?? "").trim().toLowerCase();
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setLiveStatus("error");
        return;
      }
      ws.onopen = () => ws?.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel: socketChannel } }));
      ws.onmessage = (ev) => {
        let msg: PusherMsg;
        try {
          msg = JSON.parse(ev.data as string) as PusherMsg;
        } catch {
          return;
        }
        if (msg.event === "pusher:connection_established" || msg.event === "pusher_internal:subscription_succeeded") {
          setLiveStatus("connected");
          return;
        }
        if (msg.event === "pusher:ping") {
          ws?.send(JSON.stringify({ event: "pusher:pong", data: {} }));
          return;
        }
        if (msg.event !== chatEvent) return;
        let payload: ChatPayload;
        try {
          payload = JSON.parse(msg.data) as ChatPayload;
        } catch {
          return;
        }
        const content = String(payload.content ?? "");
        const username = payload.sender?.username;
        if (!username) return;
        if (kw && !content.trim().toLowerCase().startsWith(kw)) return;
        const badges = payload.sender?.identity?.badges ?? [];
        const isSubscriber = Array.isArray(badges) && badges.some((b) => b?.type === "subscriber");
        fetch(`/api/admin/giveaways/${id}/entry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, isSubscriber }),
        })
          .then(() => scheduleRefresh())
          .catch(() => {});
      };
      ws.onerror = () => setLiveStatus("error");
      ws.onclose = () => {
        if (!closedByUs) {
          setLiveStatus("connecting");
          reconnect = setTimeout(connect, 2500);
        }
      };
    }
    connect();

    return () => {
      closedByUs = true;
      setLiveStatus("off");
      if (reconnect) clearTimeout(reconnect);
      if (pending) clearTimeout(pending);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [listening, id, refresh, channel]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function post(path: string, body?: unknown, method = "POST") {
    return fetch(`/api/admin/giveaways/${id}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async function toggleListening() {
    setBusy(true);
    const next = listening ? "closed" : "open";
    try {
      const res = await post("/status", { status: next });
      if (!res.ok) throw new Error();
      await refresh();
      flash(next === "open" ? "Listening to Kick chat" : "Stopped listening");
    } catch {
      flash("Couldn't update listening state");
    } finally {
      setBusy(false);
    }
  }

  async function exclude(username: string, excluded: boolean) {
    if (excluded && !confirm(`Exclude ${username} from this giveaway?`)) return;
    try {
      const res = await post("/exclude", { username, excluded });
      if (!res.ok) throw new Error();
      await refresh();
    } catch {
      flash("Couldn't update entry");
    }
  }

  async function addTest() {
    setBusy(true);
    try {
      await post("/test");
      await refresh();
      flash("Added test entrants (preview)");
    } finally {
      setBusy(false);
    }
  }
  async function clearAll() {
    if (!confirm("Clear ALL entries and winners for this giveaway?")) return;
    setBusy(true);
    try {
      await post("/test", undefined, "DELETE");
      reelRef.current = [];
      await refresh();
      flash("Entries cleared");
    } finally {
      setBusy(false);
    }
  }

  function buildReel(winner: Winner): { items: Entry[]; landing: number } {
    const base =
      eligible.length > 0
        ? eligible
        : [{ username: winner.username, avatar: winner.avatar, platform: "kick", isSubscriber: false, excluded: false, createdAt: "" } as Entry];
    const seq: Entry[] = [];
    const shuffled = () => [...base].sort(() => Math.random() - 0.5);
    while (seq.length < 44) seq.push(...shuffled());
    const landing = seq.length;
    const winnerEntry =
      data.entries.find((e) => e.username.toLowerCase() === winner.username.toLowerCase()) ??
      ({ username: winner.username, avatar: winner.avatar, platform: "kick", isSubscriber: false, excluded: false, createdAt: "" } as Entry);
    seq.push(winnerEntry);
    for (let i = 0; i < 6; i++) seq.push(...shuffled().slice(0, 1));
    return { items: seq.slice(0, landing + 7), landing };
  }

  function runReel(winner: Winner, onDone: () => void) {
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { items, landing } = buildReel(winner);
    reelRef.current = items;
    setData((d) => ({ ...d }));
    requestAnimationFrame(() => {
      const vp = viewportRef.current;
      const strip = stripRef.current;
      if (!vp || !strip) return onDone();
      const target = -(landing * CARD + CARD / 2 - vp.clientWidth / 2);
      if (reduce) {
        strip.style.transform = `translateX(${target}px)`;
        return onDone();
      }
      const start = performance.now();
      const dur = 4200;
      let lastIdx = -1;
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - k, 3);
        const x = target * eased;
        strip.style.transform = `translateX(${x}px)`;
        const centered = Math.round((-x + vp.clientWidth / 2 - CARD / 2) / CARD);
        if (centered !== lastIdx) {
          lastIdx = centered;
          tick(muted);
        }
        if (k < 1) requestAnimationFrame(step);
        else onDone();
      };
      requestAnimationFrame(step);
    });
  }

  async function draw() {
    if (spinning || busy) return;
    if (eligible.length === 0) return flash("No eligible entrants yet");
    setSpinning(true);
    spinningRef.current = true;
    try {
      const res = await post("/draw", { count: 1 });
      if (!res.ok) {
        flash(res.status === 409 ? "No eligible entrants" : "Draw failed");
        setSpinning(false);
        spinningRef.current = false;
        return;
      }
      const { winner } = (await res.json()) as { winner: Winner };
      runReel(winner, () => {
        setModalWinner(winner);
        chime(muted);
        setSpinning(false);
        spinningRef.current = false;
        refresh();
      });
    } catch {
      flash("Draw failed");
      setSpinning(false);
      spinningRef.current = false;
    }
  }

  const winnerEntry = modalWinner ? data.entries.find((e) => e.username.toLowerCase() === modalWinner.username.toLowerCase()) : null;
  const filtered = data.entries.filter((e) => e.username.toLowerCase().includes(search.trim().toLowerCase()));
  const reelItems = reelRef.current.length > 0 ? reelRef.current : eligible;

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-xl border border-line-strong bg-bg-2 px-4 py-2 text-sm text-text-0 shadow-lg">
          {toast}
        </div>
      )}

      {/* vault */}
      <div className="surface gold-border space-y-5 p-5 md:p-6">
        {/* header */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
          <Icon name="Gift" className="h-6 w-6 text-gold" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-extrabold tracking-tight">Giveaway Control</h1>
            <p className="text-xs text-text-2">{g.title} · <span className="text-gold">{g.prize}</span></p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-bg-1 px-3 py-1.5 text-xs">
            <span className={`relative flex h-2.5 w-2.5 ${listening && liveStatus === "connected" ? "pulse-ring rounded-full" : ""}`}>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  !listening ? "bg-text-2" : liveStatus === "connected" ? "bg-volt" : liveStatus === "error" ? "bg-danger" : "bg-gold"
                }`}
              />
            </span>
            <span className="text-text-1">
              {!listening ? "Ready" : liveStatus === "connected" ? "Kick chat connected" : liveStatus === "error" ? "Chat unreachable" : "Connecting…"}
            </span>
          </div>
          <button onClick={() => setMuted((m) => !m)} className="press grid h-9 w-9 place-items-center rounded-lg border border-line text-text-1 hover:text-text-0" aria-label={muted ? "Unmute" : "Mute"}>
            <Icon name={muted ? "VolumeX" : "Volume2"} className="h-4 w-4" />
          </button>
          <a href="/api/auth/logout" className="press inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-text-1 hover:border-danger hover:text-danger">
            <Icon name="LogOut" className="h-4 w-4" /> Sign out
          </a>
        </div>

        {/* channel + listen */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex h-12 flex-1 items-center gap-2 rounded-xl border border-line bg-bg-1 px-4 focus-within:border-gold">
            <Icon name="Radio" className="h-4 w-4 text-volt" />
            <input
              value={channelDraft}
              onChange={(e) => setChannelDraft(e.target.value)}
              onBlur={() => applyChannel(channelDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyChannel(channelDraft);
                }
              }}
              placeholder="kick channel (e.g. yuuukine)"
              spellCheck={false}
              className="h-full flex-1 bg-transparent font-mono text-base text-text-0 placeholder:text-text-2 focus:outline-none"
              aria-label="Kick channel to read"
            />
            <span className="ml-auto shrink-0 text-xs text-text-2">kick channel</span>
          </div>
          <button
            onClick={toggleListening}
            disabled={busy}
            className={`press inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold disabled:opacity-50 ${
              listening ? "border border-volt/50 bg-volt/10 text-volt" : "bg-volt text-bg-0 hover:brightness-110"
            }`}
          >
            <Icon name={listening ? "Radio" : "Play"} className={`h-4 w-4 ${listening ? "animate-pulse" : ""}`} />
            {listening ? "Listening to chat…" : "Start listening"}
          </button>
        </div>

        {/* command + current channel */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text-2">Command:</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 font-mono font-semibold text-gold">
            <Icon name="Hash" className="h-3.5 w-3.5" />
            {g.keyword ?? "—"}
          </span>
          <span className="text-text-2">
            · reading <span className="font-mono text-text-1">{channel}</span>
          </span>
        </div>

        {/* platforms */}
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl border border-volt/50 bg-volt/10 px-4 py-2.5 text-sm font-semibold text-volt">
            <Icon name="Radio" className="h-4 w-4" /> Kick Chat
          </span>
          <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm text-text-2 opacity-50" title="Not integrated">
            Twitch Chat
          </span>
          <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm text-text-2 opacity-50" title="Not integrated">
            Both (Kick + Twitch)
          </span>
        </div>

        {/* filters */}
        <div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = f.key === "subs" ? g.subscribersOnly : false;
              return (
                <span
                  key={f.key}
                  title={f.available ? (active ? "Active" : "Off") : "Not available from Kick chat events"}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                    active
                      ? "border-volt/50 bg-volt/10 text-volt"
                      : f.available
                        ? "border-line text-text-1"
                        : "cursor-not-allowed border-line text-text-2 opacity-50"
                  }`}
                >
                  <Icon name={active ? "SquareCheckBig" : f.available ? "Square" : "Lock"} className="h-3.5 w-3.5" />
                  {f.label}
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-text-2">Only filters Kick actually exposes work. Role / gifter / Yapper aren&rsquo;t in Kick&rsquo;s chat events, so they&rsquo;re locked rather than faked.</p>
        </div>

        {/* reel */}
        <div ref={viewportRef} className="relative h-44 overflow-hidden rounded-2xl border border-line bg-bg-0">
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-0.5 -translate-x-1/2 bg-gold shadow-[0_0_12px_var(--color-gold)]" />
          <div className="pointer-events-none absolute left-1/2 top-1 z-20 -translate-x-1/2 text-gold"><Icon name="ChevronDown" className="h-5 w-5" /></div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-28 w-32 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gold/40" />
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-bg-0 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-bg-0 to-transparent" />
          <div ref={stripRef} className="absolute inset-y-0 left-0 flex items-center" style={{ willChange: "transform" }}>
            {reelItems.map((e, i) => (
              <div key={i} className="flex flex-col items-center justify-center" style={{ width: CARD }}>
                <span className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-line-strong"><Avatar src={e.avatar} name={e.username} size={64} /></span>
                <span className="mt-2 max-w-[120px] truncate font-mono text-xs text-text-1">{e.username}</span>
              </div>
            ))}
            {reelItems.length === 0 && <div className="flex h-full items-center px-6 text-sm text-text-2">Entries will appear here to spin.</div>}
          </div>
        </div>

        {/* roll */}
        <button
          onClick={draw}
          disabled={spinning || eligible.length === 0}
          className="press relative inline-flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gold text-base font-extrabold uppercase tracking-wide text-bg-0 hover:bg-gold-hi disabled:opacity-50"
        >
          {spinning ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-bg-0/30 border-t-bg-0" /> Rolling winner…
            </>
          ) : (
            <>
              <Icon name="Sparkles" className="h-5 w-5" /> Roll winner
            </>
          )}
        </button>

        {/* winners + test tools */}
        <div className="flex flex-wrap items-center gap-2">
          {data.winners.map((w) => (
            <span key={w.username} className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold">
              <Icon name="Trophy" className="h-3 w-3" /> {w.username}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={addTest} disabled={busy} className="press inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs text-text-2 hover:text-text-0 disabled:opacity-50" title="Load sample entrants to rehearse the reel">
              <Icon name="FlaskConical" className="h-3.5 w-3.5" /> Add test entrants
            </button>
            <button onClick={clearAll} disabled={busy} className="press inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs text-text-2 hover:border-danger hover:text-danger disabled:opacity-50">
              <Icon name="Trash2" className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        </div>
      </div>

      {listening && liveStatus === "error" && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-text-1">
          <Icon name="TriangleAlert" className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>Couldn&rsquo;t reach Kick&rsquo;s chat socket right now (it&rsquo;s an unofficial endpoint and can rate-limit or change). It&rsquo;ll keep retrying. Meanwhile use <b>Add test entrants</b> to rehearse the reel.</div>
        </div>
      )}
      {!listening && (
        <p className="text-xs text-text-2">
          Reads Kick chat live in your browser while listening (unofficial public socket — no login needed). Hit <b>Start listening</b> during a live stream, or <b>Add test entrants</b> to preview.
        </p>
      )}

      {/* entries */}
      <div className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <p className="font-display text-sm font-bold tracking-wide">
            Entries <span className="font-mono text-volt">{data.eligibleCount}</span>
            <span className="text-text-2"> / {data.entries.length}</span>
          </p>
          <div className="flex h-9 items-center gap-2 rounded-lg border border-line bg-bg-1 px-3">
            <Icon name="Search" className="h-4 w-4 text-text-2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="h-full w-36 bg-transparent text-sm focus:outline-none" />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="pt-4 text-sm text-text-2">{data.entries.length === 0 ? "Nobody has entered yet." : "No matches."}</p>
        ) : (
          <div className="mt-1 max-h-96 divide-y divide-line/60 overflow-y-auto">
            {filtered.map((e) => (
              <div key={e.username} className={`flex items-center gap-3 py-2.5 ${e.excluded ? "opacity-50" : ""}`}>
                <span className="h-9 w-9 overflow-hidden rounded-full ring-1 ring-line-strong"><Avatar src={e.avatar} name={e.username} size={36} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-text-0">
                    {e.username}
                    {e.isSubscriber && <span className="ml-2 rounded bg-volt/15 px-1.5 text-[10px] font-semibold uppercase text-volt">sub</span>}
                  </p>
                  <p className="text-xs text-text-2">{e.createdAt ? new Date(e.createdAt.replace(" ", "T") + "Z").toLocaleTimeString() : "—"}</p>
                </div>
                <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-2">Kick</span>
                <button onClick={() => exclude(e.username, !e.excluded)} className="press grid h-8 w-8 place-items-center rounded-lg border border-line text-text-2 hover:text-text-0" title={e.excluded ? "Restore" : "Exclude"}>
                  <Icon name={e.excluded ? "RotateCcw" : "Ban"} className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* winner modal */}
      {modalWinner && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-bg-0/80 backdrop-blur-md" aria-label="Close" onClick={() => setModalWinner(null)} />
          <div className="pop-in surface gold-border relative w-full max-w-md overflow-hidden p-8 text-center">
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className="confetti-piece absolute top-0 h-2 w-2 rounded-sm" style={{ left: `${(i * 7 + 5) % 100}%`, background: i % 2 ? "var(--color-gold)" : "var(--color-volt)", animationDelay: `${(i % 5) * 0.08}s` }} />
              ))}
            </div>
            <p className="label text-gold">Winner selected</p>
            <div className="mx-auto mt-4 h-24 w-24 overflow-hidden rounded-full ring-4 ring-gold"><Avatar src={modalWinner.avatar} name={modalWinner.username} size={96} /></div>
            <p className="mt-4 font-display text-2xl font-extrabold">{modalWinner.username}</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-volt/40 bg-volt/10 px-3 py-1 text-xs text-volt"><Icon name="Radio" className="h-3 w-3" /> Kick Chat</span>

            <div className="mt-6 space-y-2 rounded-xl border border-line bg-bg-1 p-4 text-left text-sm">
              <p className="label">Verification</p>
              <div className="flex items-center gap-2">
                <Icon name={winnerEntry?.isSubscriber ? "CircleCheck" : "CircleMinus"} className={`h-4 w-4 ${winnerEntry?.isSubscriber ? "text-volt" : "text-text-2"}`} />
                <span className="text-text-1">{winnerEntry?.isSubscriber ? "Verified Kick subscriber" : "Not a subscriber"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="CircleHelp" className="h-4 w-4 text-text-2" />
                <span className="text-text-2">Role / gifter / Yapper — unavailable from Kick</span>
              </div>
              <a href={`/verify/${id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-plasma hover:underline"><Icon name="ShieldCheck" className="h-3.5 w-3.5" /> Provably-fair proof</a>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => { setModalWinner(null); draw(); }} className="press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong text-sm hover:border-gold hover:text-gold">
                <Icon name="Shuffle" className="h-4 w-4" /> Draw another
              </button>
              <button onClick={() => setModalWinner(null)} className="press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gold text-sm font-semibold text-bg-0 hover:bg-gold-hi">
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
