import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./db";
import { memberAvatar } from "./discordTickets";

// Image cards for the Discord slash commands: /profile (a player card: avatar,
// totals, last win) and /top (this month's biggest winners). Rendered to PNG
// with next/og and posted as an attachment, so the chat shows a picture, not
// a link. Fonts are TTF copies of the site's (assets/og), the palette is ONO's.

const C = {
  bg0: "#05070d", bg1: "#0a1020", bg2: "#0f172a", line: "rgba(125,162,255,0.16)",
  text0: "#e6ecf5", text1: "#8a94a8", text2: "#5c6578",
  gold: "#f5c451", goldHi: "#ffd97a", volt: "#34d399", plasma: "#8b5cf6", kick: "#53fc18", discord: "#5865F2",
};
// Same generated avatar as the site (components/ui/UserAvatar.tsx): gradient
// + icon watermark picked from the name, first letter in the graffiti font.
const THEMES = [
  ["#f5c451", "#ff3d9a"], ["#22d3ee", "#8b5cf6"], ["#34d399", "#22d3ee"], ["#ff3d9a", "#ff8a3d"],
  ["#8b5cf6", "#f5c451"], ["#ff4d5e", "#f5c451"], ["#0ea5e9", "#34d399"], ["#a855f7", "#ff3d9a"],
];
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Fonts = NonNullable<NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"]>;
let assets: Promise<{ fonts: Fonts; logo: string; marks: string[] }> | null = null;
function loadAssets() {
  assets ??= (async () => {
    const dir = join(process.cwd(), "assets/og");
    const [clash, inter4, inter6, mono, tag, logo, marksJson] = await Promise.all(
      ["ClashDisplay-Bold.ttf", "InterTight-400.ttf", "InterTight-600.ttf", "JetBrainsMono-500.ttf", "RubikWetPaint-tag.ttf", "logo.png", "avatar-marks.json"]
        .map((f) => readFile(join(dir, f))));
    const marks = JSON.parse(marksJson.toString()) as { order: string[]; svg: Record<string, string> };
    return {
      fonts: [
        { name: "Clash", data: clash, weight: 700 as const, style: "normal" as const },
        { name: "Inter", data: inter4, weight: 400 as const, style: "normal" as const },
        { name: "Inter", data: inter6, weight: 600 as const, style: "normal" as const },
        { name: "Mono", data: mono, weight: 500 as const, style: "normal" as const },
        { name: "Tag", data: tag, weight: 400 as const, style: "normal" as const },
      ],
      logo: `data:image/png;base64,${logo.toString("base64")}`,
      // icon watermarks as ready-to-use SVG images (black stroke; faded on the avatar)
      marks: marks.order.map((n) => `data:image/svg+xml;base64,${Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${marks.svg[n]}</svg>`).toString("base64")}`),
    };
  })();
  return assets;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
function ago(dbTime: string): string {
  const days = Math.floor((Date.now() - new Date(`${dbTime.replace(" ", "T")}Z`).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : `${Math.floor(days / 30)} mo ago`;
}

/** Remote image → data URI (satori would fetch it too, but this bounds the wait). */
async function inlineImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") ?? "image/png";
    if (!/png|jpe?g/.test(type)) return null; // satori: png / jpeg only
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { return null; }
}

/** The site's generated avatar, drawn for the image cards. */
function GeneratedAvatar({ name, size, marks }: { name: string; size: number; marks: string[] }) {
  const h = hash(name.trim().toLowerCase() || "?");
  const [a, b] = THEMES[h % THEMES.length];
  const letter = (name.trim().match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: size, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", background: `linear-gradient(135deg, ${a}, ${b})` }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.35), rgba(255,255,255,0) 55%)" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={marks[(h >>> 3) % marks.length]} width={size * 0.78} height={size * 0.78} alt=""
        style={{ position: "absolute", right: -size * 0.14, bottom: -size * 0.12, transform: "rotate(-18deg)", opacity: 0.25 }} />
      <div style={{ display: "flex", fontFamily: "Tag", fontSize: size * 0.62, lineHeight: 1, color: "#fff", transform: "rotate(-8deg)",
        textShadow: `0 ${size * 0.025}px 0 #000, ${size * 0.03}px ${size * 0.04}px 0 rgba(0,0,0,0.55)` }}>{letter}</div>
    </div>
  );
}

/** A real picture when we have one (png / jpeg), else the generated avatar. */
function Avatar({ src, name, size, marks }: { src: string | null; name: string; size: number; marks: string[] }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={size} height={size} alt="" style={{ borderRadius: size, objectFit: "cover" }} /> : <GeneratedAvatar name={name} size={size} marks={marks} />;
}

function Frame({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  return (
    <div style={{ width, height, display: "flex", position: "relative", fontFamily: "Inter", color: C.text0, overflow: "hidden",
      backgroundColor: C.bg0,
      backgroundImage: "radial-gradient(circle at 95% 0%, rgba(245,196,81,0.20), rgba(245,196,81,0) 45%), radial-gradient(circle at 0% 100%, rgba(139,92,246,0.20), rgba(139,92,246,0) 45%)" }}>
      <div style={{ position: "absolute", inset: 0, border: `2px solid ${C.line}`, borderRadius: 28, display: "flex" }} />
      {children}
    </div>
  );
}

// ── /profile ──────────────────────────────────────────────────────────────
export interface ProfileData {
  name: string; avatar: string | null; kick: string | null; discord: string | null; memberSince: string | null;
  prizes: number; total: number; podiums: number; giveaways: number;
  best: { title: string; amount: number } | null; last: { title: string; amount: number | null; label: string; at: string } | null;
}

/** Everything the player card shows, for a Discord user (site account linked by Discord, plus prizes their tickets carried). */
export async function getProfileData(discordId: string, fallback: { name: string; avatar: string | null }): Promise<ProfileData> {
  const pool = getPool();
  const [acc] = await pool.query<RowDataPacket[]>(
    `SELECT a.id, a.display_name, a.created_at, k.provider_user_id kick_id, k.username kick, d.username discord
       FROM user_identities d JOIN user_accounts a ON a.id = d.account_id
       LEFT JOIN user_identities k ON k.account_id = a.id AND k.provider = 'kick'
      WHERE d.provider = 'discord' AND d.provider_user_id = ?`, [discordId]);
  const a = acc[0];
  const or = ["pa.winner_discord_id = ?", "pa.discord_user_id = ?"];
  const args: unknown[] = [discordId, discordId];
  if (a?.kick_id) { or.push("pa.winner_kick_id = ?"); args.push(a.kick_id); }
  if (a?.kick) { or.push("(pa.winner_kick_id IS NULL AND pa.winner_discord_id IS NULL AND LOWER(pa.winner) = LOWER(?))"); args.push(a.kick); }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT pa.title, pa.source, pa.place, pa.amount, pa.prize_label, pa.created_at FROM prize_awards pa
      WHERE pa.status <> 'void' AND pa.source NOT IN ('leaderboard','race') AND (${or.join(" OR ")})
      ORDER BY pa.created_at DESC LIMIT 200`, args);
  const amount = (r: RowDataPacket) => (r.amount != null ? Number(r.amount) : 0);
  const best = rows.reduce<RowDataPacket | null>((b, r) => (amount(r) > (b ? amount(b) : 0) ? r : b), null);
  const last = rows[0];
  return {
    name: a?.display_name ?? fallback.name, avatar: fallback.avatar,
    kick: a?.kick ?? null, discord: a?.discord ?? null, memberSince: a?.created_at ?? null,
    prizes: rows.length,
    total: rows.reduce((s, r) => s + amount(r), 0),
    podiums: rows.filter((r) => r.source === "tournament" && r.place && r.place <= 3).length,
    giveaways: rows.filter((r) => r.source === "giveaway").length,
    best: best ? { title: String(best.title), amount: amount(best) } : null,
    last: last ? { title: String(last.title), amount: last.amount != null ? Number(last.amount) : null, label: String(last.prize_label ?? ""), at: String(last.created_at) } : null,
  };
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "18px 22px", borderRadius: 18, background: "rgba(15,23,42,0.75)", border: `1.5px solid ${C.line}` }}>
      <div style={{ fontSize: 15, letterSpacing: 3, color: C.text2, textTransform: "uppercase", display: "flex" }}>{label}</div>
      <div style={{ fontFamily: "Mono", fontSize: 40, color, marginTop: 6, display: "flex" }}>{value}</div>
    </div>
  );
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, border: `1.5px solid ${color}66`, background: `${color}1f`, color, fontSize: 18, fontWeight: 600 }}>
      {children}
    </div>
  );
}

export async function renderProfileCard(p: ProfileData): Promise<Buffer> {
  const { fonts, logo, marks } = await loadAssets();
  const avatar = await inlineImage(p.avatar);
  const W = 1100, H = 480;
  const img = new ImageResponse(
    (
      <Frame width={W} height={H}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: "44px 52px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
            <div style={{ display: "flex", padding: 6, borderRadius: 200, background: `linear-gradient(135deg, ${C.goldHi}, ${C.gold}, #c08a2a)`, boxShadow: "0 0 50px rgba(245,196,81,0.45)" }}>
              <div style={{ display: "flex", borderRadius: 180, border: `5px solid ${C.bg0}` }}><Avatar src={avatar} name={p.name} size={164} marks={marks} /></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, letterSpacing: 5, color: C.gold, textTransform: "uppercase", display: "flex" }}>ONO Degen Tunnel · Player card</div>
              <div style={{ fontFamily: "Clash", fontSize: p.name.length > 14 ? 56 : 72, lineHeight: 1, marginTop: 10, textTransform: "uppercase", display: "flex" }}>{p.name}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                {p.kick && <Pill color={C.kick}>KICK · {p.kick}</Pill>}
                {p.discord && <Pill color="#8f99ff">DISCORD · {p.discord}</Pill>}
                {!p.kick && !p.discord && <Pill color={C.text1}>No ONO account yet</Pill>}
                {p.memberSince && <Pill color={C.text1}>Since {new Date(`${p.memberSince.replace(" ", "T")}Z`).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</Pill>}
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={120} height={110} style={{ alignSelf: "flex-start", opacity: 0.95 }} alt="" />
          </div>

          <div style={{ display: "flex", gap: 16, marginTop: 38 }}>
            <Stat label="Total won" value={money(p.total)} color={C.gold} />
            <Stat label="Prizes" value={String(p.prizes)} color={C.text0} />
            <Stat label="Podiums" value={String(p.podiums)} color={C.text0} />
            <Stat label="Giveaways" value={String(p.giveaways)} color={C.volt} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, fontSize: 19, color: C.text1 }}>
            <div style={{ display: "flex" }}>
              {p.last
                ? <>Last win <span style={{ color: C.text0, fontWeight: 600, margin: "0 8px" }}>{p.last.title}</span> · <span style={{ color: C.gold, margin: "0 8px" }}>{p.last.amount != null ? money(p.last.amount) : p.last.label || "prize"}</span> · {ago(p.last.at)}</>
                : "No win yet — the next giveaway could be yours."}
            </div>
            {p.best && p.prizes > 1 && <div style={{ display: "flex" }}>Best <span style={{ color: C.gold, marginLeft: 8 }}>{money(p.best.amount)}</span></div>}
          </div>
        </div>
      </Frame>
    ),
    { width: W, height: H, fonts },
  );
  return Buffer.from(await img.arrayBuffer());
}

// ── /top ──────────────────────────────────────────────────────────────────
export interface TopRow { name: string; prizes: number; total: number; avatar?: string | null }

/** Biggest stream winners this month (falls back to all time when the month is empty). Casino-username prizes are left out. */
export async function getTopWinners(limit = 10): Promise<{ rows: TopRow[]; period: string }> {
  const q = (since: string | null) => getPool().query<RowDataPacket[]>(
    `SELECT MAX(winner) name, COUNT(*) prizes, COALESCE(SUM(amount), 0) total,
            MAX(winner_discord_id) discord_winner, MAX(discord_user_id) discord_ticket FROM prize_awards
      WHERE status <> 'void' AND source NOT IN ('leaderboard','race') ${since ? "AND created_at >= ?" : ""}
      GROUP BY LOWER(winner) ORDER BY total DESC, prizes DESC LIMIT ?`, since ? [since, limit] : [limit]);
  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01 00:00:00`;
  let [rows] = await q(monthStart);
  let period = now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  if (!rows.length) { [rows] = await q(null); period = "All time"; }
  const out = await Promise.all(rows.map(async (r) => ({
    name: String(r.name), prizes: Number(r.prizes), total: Number(r.total),
    avatar: await avatarFor(String(r.name), [r.discord_winner, r.discord_ticket].filter(Boolean).map(String)),
  })));
  return { rows: out, period };
}

/**
 * A winner's picture: the Discord avatar of their site account (or of the
 * Discord member their prize ticket went to), else their site avatar. null →
 * the card draws the generated one, like the site does.
 */
async function avatarFor(name: string, discordIds: string[]): Promise<string | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT d.avatar discord_avatar, a.avatar account_avatar FROM user_identities k
       JOIN user_accounts a ON a.id = k.account_id
       LEFT JOIN user_identities d ON d.account_id = a.id AND d.provider = 'discord'
      WHERE k.provider = 'kick' AND LOWER(k.username) = LOWER(?)
     UNION ALL
     SELECT d.avatar, a.avatar FROM user_identities d JOIN user_accounts a ON a.id = d.account_id
      WHERE d.provider = 'discord' AND d.provider_user_id IN (?)
     LIMIT 1`, [name, discordIds.length ? discordIds : [""]]);
  const r = rows[0];
  const picked = r?.discord_avatar || null;
  if (picked) return picked;
  for (const id of discordIds) {
    const a = await memberAvatar(id);
    if (a) return a;
  }
  return r?.account_avatar || null;
}

const RANK = [C.gold, "#cfd6e4", "#d08a4e"];

export async function renderTopCard(top: { rows: TopRow[]; period: string }): Promise<Buffer> {
  const { fonts, logo, marks } = await loadAssets();
  const pics = await Promise.all(top.rows.map((r) => inlineImage(r.avatar ?? null)));
  const W = 1000, rowH = 62, H = 200 + Math.max(1, top.rows.length) * rowH + 30;
  const max = Math.max(1, ...top.rows.map((r) => r.total));
  const img = new ImageResponse(
    (
      <Frame width={W} height={H}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: "40px 48px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={92} height={84} alt="" />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 16, letterSpacing: 5, color: C.gold, textTransform: "uppercase", display: "flex" }}>ONO Degen Tunnel · {top.period}</div>
              <div style={{ fontFamily: "Clash", fontSize: 64, lineHeight: 1, marginTop: 6, display: "flex" }}>TOP WINNERS</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 30, gap: 8 }}>
            {top.rows.length === 0 && <div style={{ display: "flex", fontSize: 22, color: C.text1 }}>No winners yet — be the first.</div>}
            {top.rows.map((r, i) => (
              <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 18, height: rowH - 8, padding: "0 18px", borderRadius: 16, position: "relative", overflow: "hidden",
                background: i < 3 ? "rgba(245,196,81,0.07)" : "rgba(15,23,42,0.7)", border: `1.5px solid ${i < 3 ? "rgba(245,196,81,0.35)" : C.line}` }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(r.total / max) * 100}%`, background: "linear-gradient(90deg, rgba(245,196,81,0.10), rgba(245,196,81,0))", display: "flex" }} />
                <div style={{ width: 40, height: 40, borderRadius: 40, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Clash", fontSize: 22,
                  background: i < 3 ? RANK[i] : "transparent", color: i < 3 ? C.bg0 : C.text1, border: i < 3 ? "none" : `1.5px solid ${C.line}` }}>{i + 1}</div>
                <Avatar src={pics[i]} name={r.name} size={38} marks={marks} />
                <div style={{ display: "flex", flex: 1, fontSize: 24, fontWeight: 600 }}>{r.name}</div>
                <div style={{ display: "flex", fontSize: 18, color: C.text1 }}>{r.prizes} prize{r.prizes > 1 ? "s" : ""}</div>
                <div style={{ display: "flex", width: 150, justifyContent: "flex-end", fontFamily: "Mono", fontSize: 26, color: i < 3 ? C.gold : C.text0 }}>{money(r.total)}</div>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    ),
    { width: W, height: H, fonts },
  );
  return Buffer.from(await img.arrayBuffer());
}
