import "server-only";
import { after } from "next/server";
import { createPublicKey, verify } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./db";
import { EventError } from "./events/common";
import { explainError } from "./events/messages";
import { claimFromDiscord, confirmReceivedFromDiscord } from "./prizes";
import { USDC_NETWORKS, checkDestination, describeDestination, networkLabel, type PayoutMethod } from "./payout";

// Buttons on the Discord prize ticket (lib/discordTickets.ts). Discord POSTs
// every click to /api/discord/interactions, signed with the application's
// Ed25519 key (DISCORD_PUBLIC_KEY).
//
//   💸 Claim prize   → (ephemeral) Stake / Rainbet / USDC wallet buttons
//     Stake|Rainbet  → form: username
//     USDC wallet    → network menu → form: address
//   ✅ I received it → marks it received
//
// Only the ticket's winner may claim / confirm (staff may claim for them).
// Anything touching the database is deferred: Discord needs an answer within
// 3 s, the real reply is edited in after the response.

const API = "https://discord.com/api/v10";
const EPHEMERAL = 64;
const ADMINISTRATOR = 1n << 3n, MANAGE_GUILD = 1n << 5n, MODERATE_MEMBERS = 1n << 40n;
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordRequest(body: string, signature: string | null, timestamp: string | null): boolean {
  const key = process.env.DISCORD_PUBLIC_KEY;
  if (!key || !signature || !timestamp || !/^[0-9a-f]{64}$/i.test(key) || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  try {
    const pub = createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(key, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + body), pub, Buffer.from(signature, "hex"));
  } catch { return false; }
}

interface Interaction {
  type: number; id: string; token: string; application_id: string;
  member?: { user: { id: string }; permissions?: string }; user?: { id: string };
  data?: { custom_id?: string; values?: string[]; components?: ModalRow[] };
}
interface ModalRow { type: number; components?: { custom_id: string; value?: string }[]; component?: { custom_id: string; value?: string } }

const msg = (content: string, components: unknown[] = []) => ({ content, components, flags: EPHEMERAL, allowed_mentions: { parse: [] } });
const reply = (content: string) => ({ type: 4, data: msg(content) });
const DEFER = { type: 5, data: { flags: EPHEMERAL } };

/** Replace the deferred "thinking…" reply. */
async function editReply(i: Interaction, body: object): Promise<void> {
  const res = await fetch(`${API}/webhooks/${i.application_id}/${i.token}/messages/@original`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) console.error("discord interaction reply failed", res.status, await res.text());
}

function deferred(i: Interaction, work: () => Promise<object>) {
  after(async () => {
    let body: object;
    try { body = await work(); } catch (e) {
      if (!(e instanceof EventError)) console.error("discord interaction failed", e);
      body = msg(`❌ ${e instanceof EventError ? explainError(e.code) : "Something went wrong. Try again in a minute."}`);
    }
    await editReply(i, body);
  });
  return DEFER;
}

interface AwardRow extends RowDataPacket { id: number; title: string; amount: string | null; prize_label: string; status: string; claimed_at: string | null; received_at: string | null; discord_user_id: string | null }

async function loadAward(id: number): Promise<AwardRow> {
  const [rows] = await getPool().query<AwardRow[]>(
    "SELECT id, title, amount, prize_label, status, claimed_at, received_at, discord_user_id FROM prize_awards WHERE id = ?", [id]);
  if (!rows[0]) throw new EventError("award_not_found");
  return rows[0];
}

interface Saved { stake: string; rainbet: string; usdc: string; network: string }
/** Destinations saved on the site account linked to this Discord user. */
async function savedFor(discordId: string): Promise<Saved | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT a.stake_username, a.rainbet_username, a.usdc_address, a.usdc_network FROM user_identities i
       JOIN user_accounts a ON a.id = i.account_id WHERE i.provider = 'discord' AND i.provider_user_id = ?`, [discordId]);
  const r = rows[0];
  return r ? { stake: r.stake_username, rainbet: r.rainbet_username, usdc: r.usdc_address, network: r.usdc_network } : null;
}

const prizeOf = (a: AwardRow) => (a.amount != null ? `$${Number(a.amount).toFixed(2)}` : a.prize_label || "your prize");

function methodButtons(id: number) {
  return [{
    type: 1, components: [
      { type: 2, style: 1, custom_id: `prize:pick:stake:${id}`, label: "Stake", emoji: { name: "🎲" } },
      { type: 2, style: 1, custom_id: `prize:pick:rainbet:${id}`, label: "Rainbet", emoji: { name: "🌧️" } },
      { type: 2, style: 1, custom_id: `prize:pick:usdc:${id}`, label: "USDC wallet", emoji: { name: "💵" } },
    ],
  }];
}

function destinationModal(id: number, method: PayoutMethod, network: string, prefill: string) {
  const usdc = method === "usdc";
  const label = usdc ? `USDC address · ${networkLabel(network)}`.slice(0, 45) : `Your ${method === "stake" ? "Stake" : "Rainbet"} username`;
  return {
    type: 9,
    data: {
      custom_id: `prize:modal:${method}:${network}:${id}`,
      title: usdc ? "Send to my USDC wallet" : `Send to my ${method === "stake" ? "Stake" : "Rainbet"} account`,
      components: [{
        type: 1, components: [{
          type: 4, custom_id: "value", label, style: 1, required: true, min_length: 3, max_length: 64,
          placeholder: usdc ? USDC_NETWORKS.find((n) => n.id === network)?.hint ?? "" : "username",
          ...(prefill ? { value: prefill } : {}),
        }],
      }],
    },
  };
}

/** Saved value to pre-fill the form, without risking Discord's 3 s deadline. */
async function prefillFor(userId: string, method: PayoutMethod, network: string): Promise<string> {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 1200));
  const saved = await Promise.race([savedFor(userId).catch(() => null), timeout]);
  if (!saved) return "";
  if (method === "usdc") return saved.network === network ? saved.usdc : "";
  return saved[method];
}

function modalValue(rows: ModalRow[] | undefined): string {
  for (const r of rows ?? []) {
    for (const c of r.components ?? (r.component ? [r.component] : [])) if (c.custom_id === "value") return c.value ?? "";
  }
  return "";
}

export async function handleInteraction(i: Interaction): Promise<object> {
  if (i.type === 1) return { type: 1 }; // PING
  const userId = i.member?.user.id ?? i.user?.id;
  if (!userId) return reply("❌ Use this inside the server.");
  const perms = BigInt(i.member?.permissions ?? "0");
  const staff = (perms & (ADMINISTRATOR | MANAGE_GUILD | MODERATE_MEMBERS)) !== 0n;
  const parts = (i.data?.custom_id ?? "").split(":");
  if (parts[0] !== "prize") return reply("❌ Unknown action.");
  const id = Number(parts[parts.length - 1]);
  if (!Number.isInteger(id) || id <= 0) return reply("❌ Unknown prize.");

  // 💸 Claim prize → choose where
  if (i.type === 3 && parts[1] === "claim") {
    return deferred(i, async () => {
      const a = await loadAward(id);
      if (!staff && a.discord_user_id !== userId) throw new EventError("award_not_yours");
      if (a.status !== "pending") throw new EventError("award_not_pending");
      const saved = await savedFor(userId);
      const hint = saved && (saved.stake || saved.rainbet || saved.usdc)
        ? `\n-# Saved on your account: ${[saved.stake && `Stake \`${saved.stake}\``, saved.rainbet && `Rainbet \`${saved.rainbet}\``, saved.usdc && `USDC \`${saved.usdc.slice(0, 6)}…\``].filter(Boolean).join(" · ")}`
        : "";
      return msg(`**Where should we send ${prizeOf(a)}?** (prize #${a.id} · ${a.title})${hint}`, methodButtons(id));
    });
  }

  // Stake / Rainbet → form; USDC → network first
  if (i.type === 3 && parts[1] === "pick") {
    const method = parts[2] as PayoutMethod;
    if (method === "usdc") {
      return {
        type: 7,
        data: msg("**USDC wallet** — which network is your address on? Pick the exact one, a wrong network can lose the funds.", [
          { type: 1, components: [{ type: 3, custom_id: `prize:net:${id}`, placeholder: "Choose the network", options: USDC_NETWORKS.map((n) => ({ label: n.label, value: n.id, description: n.hint })) }] },
          ...methodButtons(id),
        ]),
      };
    }
    if (method !== "stake" && method !== "rainbet") return reply("❌ Unknown payout method.");
    return destinationModal(id, method, "", await prefillFor(userId, method, ""));
  }
  if (i.type === 3 && parts[1] === "net") {
    const network = i.data?.values?.[0] ?? "";
    if (!USDC_NETWORKS.some((n) => n.id === network)) return reply("❌ Unknown network.");
    return destinationModal(id, "usdc", network, await prefillFor(userId, "usdc", network));
  }

  // form submitted → save the claim
  if (i.type === 5 && parts[1] === "modal") {
    const check = checkDestination(parts[2], modalValue(i.data?.components), parts[3]);
    if (!check.ok) return reply(`❌ ${check.error}\nPress **Claim prize** again to fix it.`);
    return deferred(i, async () => {
      await claimFromDiscord(id, userId, staff, check.dest);
      return msg(`✅ **Claim saved!** We'll send it to \`${describeDestination(check.dest.method, check.dest.value, check.dest.network)}\`.\nYou can change it with **Change payout** until it's paid.`);
    });
  }

  // ✅ I received it
  if (i.type === 3 && parts[1] === "recv") {
    return deferred(i, async () => {
      await confirmReceivedFromDiscord(id, userId);
      return msg("🎉 **Thanks for confirming!** Enjoy the win.");
    });
  }

  return reply("❌ Unknown action.");
}
