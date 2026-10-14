import { NextResponse } from "next/server";
import { handleInteraction, verifyDiscordRequest } from "@/lib/discordInteractions";

// Discord Interactions Endpoint URL (Developer Portal → General Information):
// <site>/api/discord/interactions. Prize ticket buttons land here. Unsigned or
// badly signed requests are refused, as Discord requires.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyDiscordRequest(body, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"))) {
    return new NextResponse("invalid request signature", { status: 401 });
  }
  try {
    return NextResponse.json(await handleInteraction(JSON.parse(body)));
  } catch (err) {
    console.error("discord interaction failed", err);
    return NextResponse.json({ type: 4, data: { content: "❌ Something went wrong. Try again in a minute.", flags: 64 } });
  }
}
