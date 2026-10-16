// Payout destinations: a Stake username or a USDC wallet on Ethereum (lib/payout).
import test from "node:test";
import assert from "node:assert/strict";
import { checkDestination, describeDestination } from "../lib/payout";

const ok = (m: string, v: string) => {
  const r = checkDestination(m, v);
  assert.ok(r.ok, `${m} ${v} should pass${r.ok ? "" : `: ${r.error}`}`);
  return r.ok ? r.dest : null;
};
const bad = (m: string, v: string) => assert.equal(checkDestination(m, v).ok, false, `${m} "${v}" should fail`);

test("Stake usernames", () => {
  assert.deepEqual(ok("stake", "  OnoFan_99 "), { method: "stake", value: "OnoFan_99", network: "" });
  ok("stake", "stake.guy-1");
  bad("stake", "");
  bad("stake", "ab");
  bad("stake", "has space");
  bad("stake", "<script>");
  bad("stake", "x".repeat(33));
});

test("USDC is an Ethereum address, always ERC-20", () => {
  assert.deepEqual(ok("usdc", " 0x52908400098527886E0F7030069857D2E4169EE7 "),
    { method: "usdc", value: "0x52908400098527886E0F7030069857D2E4169EE7", network: "ERC20" });
  bad("usdc", "");
  bad("usdc", "0x1234");                                        // too short
  bad("usdc", "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV");   // Solana: not accepted any more
  bad("usdc", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7");            // Tron
});

test("Rainbet and other methods are refused", () => {
  bad("rainbet", "rain_guy");
  bad("other", "anything");
});

test("describe (old claims still read fine)", () => {
  assert.equal(describeDestination("stake", "abc"), "Stake · abc");
  assert.equal(describeDestination("usdc", "0xabc", "ERC20"), "USDC · 0xabc");
  assert.equal(describeDestination("usdc", "7Ec…", "SOL"), "USDC (Solana) · 7Ec…");
  assert.equal(describeDestination("rainbet", "old"), "Rainbet · old");
  assert.equal(describeDestination(null, ""), "—");
});
