// Payout destinations: each method validated on its own (lib/payout).
import test from "node:test";
import assert from "node:assert/strict";
import { checkDestination, describeDestination } from "../lib/payout";

const ok = (m: string, v: string, n = "") => {
  const r = checkDestination(m, v, n);
  assert.ok(r.ok, `${m} ${n} ${v} should pass${r.ok ? "" : `: ${r.error}`}`);
  return r.ok ? r.dest : null;
};
const bad = (m: string, v: string, n = "") => assert.equal(checkDestination(m, v, n).ok, false, `${m} ${n} "${v}" should fail`);

test("Stake and Rainbet usernames", () => {
  assert.deepEqual(ok("stake", "  OnoFan_99 "), { method: "stake", value: "OnoFan_99", network: "" });
  ok("rainbet", "rain.guy-1");
  bad("stake", "");
  bad("stake", "ab");
  bad("rainbet", "has space");
  bad("rainbet", "<script>");
  bad("stake", "x".repeat(33));
});

test("USDC needs a network and an address of that network", () => {
  const evm = "0x52908400098527886E0F7030069857D2E4169EE7";
  for (const n of ["ERC20", "BEP20", "POLYGON", "BASE", "ARBITRUM"]) ok("usdc", evm, n);
  assert.equal(ok("usdc", evm, "base")?.network, "BASE", "network is case-insensitive");
  ok("usdc", "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV", "SOL");
  ok("usdc", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7", "TRC20");
  bad("usdc", evm, "");                     // no network
  bad("usdc", evm, "DOGE");                 // unknown network
  bad("usdc", evm, "SOL");                  // EVM address on Solana
  bad("usdc", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7", "ERC20");
  bad("usdc", "0x1234", "ERC20");           // too short
  bad("usdc", "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLt0", "SOL"); // 0 isn't base58
  bad("other", "anything");
});

test("describe", () => {
  assert.equal(describeDestination("stake", "abc"), "Stake · abc");
  assert.equal(describeDestination("usdc", "0xabc", "SOL"), "USDC (Solana) · 0xabc");
  assert.equal(describeDestination(null, ""), "—");
});
