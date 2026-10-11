// Shared eligibility rules for the server and control panel.
export function entryEligible(entry: { excluded: unknown; is_subscriber: unknown; message_count: unknown }, giveaway: { subscribers_only: unknown; min_messages: unknown }): boolean {
  return !entry.excluded && (!giveaway.subscribers_only || Boolean(entry.is_subscriber)) && Number(entry.message_count) >= Math.max(1, Number(giveaway.min_messages) || 1);
}

export function collectionOpen(giveaway: { status: unknown; ends_at?: unknown; drawn_entrants?: unknown; server_seed?: unknown }, now = Date.now()): boolean {
  if (giveaway.server_seed !== undefined && !String(giveaway.server_seed).startsWith("v2")) return false;
  if (giveaway.status !== "open" || giveaway.drawn_entrants) return false;
  if (!giveaway.ends_at) return true;
  const end = String(giveaway.ends_at).replace(" ", "T");
  const instant = Date.parse(/[Z]|[+-]\d{2}:\d{2}$/.test(end) ? end : end + "Z");
  return Number.isFinite(instant) && instant > now;
}
