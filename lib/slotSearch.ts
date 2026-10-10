import "server-only";

// Slot-name autocomplete — ported from JBALLIN. slot.report has no search
// endpoint, only the full list (~6k slots, ~3MB), so we fetch it once and let
// Next's data cache hold it for a day. Degrades to no suggestions on any
// failure (so the admin form never 500s). The key is tied to the dofollow
// slot.report link in the footer — if that link is removed, the key is
// suspended automatically.

export interface SlotSuggestion {
  name: string;
  provider: string;
  imageUrl: string;
}

interface SlotReportEntry {
  name: string;
  slug: string;
  provider: string;
}
interface SlotReportResponse {
  results: SlotReportEntry[];
}

function thumbUrl(slug: string): string {
  return `https://slot.report/images/slots/${slug}-thumb.webp`;
}

async function getAllSlots(): Promise<SlotReportEntry[]> {
  const apiKey = process.env.SLOT_REPORT_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch("https://slot.report/api/v1/slots.json", {
      headers: { "X-API-Key": apiKey },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const data: SlotReportResponse = await res.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

export async function searchSlots(query: string, limit = 8): Promise<SlotSuggestion[]> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return [];
  const slots = await getAllSlots();
  const matches: SlotSuggestion[] = [];
  for (const slot of slots) {
    if (slot.name.toLowerCase().includes(trimmed)) {
      matches.push({ name: slot.name, provider: slot.provider, imageUrl: thumbUrl(slot.slug) });
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
