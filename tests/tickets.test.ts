// Discord ticket channel names say what was won, then who (lib/discordTickets).
import test from "node:test";
import assert from "node:assert/strict";
import { ticketChannelName } from "../lib/discordTickets";

test("ticket names: place + event + winner", () => {
  assert.equal(ticketChannelName({ winner: "YUUUKINE", source: "tournament", place: 1 }), "🏆｜1st-tournament-yuuukine");
  assert.equal(ticketChannelName({ winner: "Blazen420yt", source: "tournament", place: 3 }, "💸"), "💸｜3rd-tournament-blazen420yt");
  assert.equal(ticketChannelName({ winner: "amy", source: "gb", place: 1 }), "🏆｜gb-win-amy");
  assert.equal(ticketChannelName({ winner: "bob", source: "giveaway", place: null }), "🏆｜giveaway-bob");
  assert.equal(ticketChannelName({ winner: "x y!z", source: "challenge", place: 1 }), "🏆｜challenge-x-y-z");
  assert.equal(ticketChannelName({ winner: "kim", source: "race", place: 2 }), "🏆｜2nd-race-kim");
  assert.equal(ticketChannelName({ winner: "kim", source: "leaderboard", place: 7 }), "🏆｜7th-leaderboard-kim");
  assert.equal(ticketChannelName({ winner: "ono", source: "manual", place: null }), "🏆｜prize-ono");
  assert.ok(ticketChannelName({ winner: "a".repeat(300), source: "giveaway", place: null }).length <= 100);
});
