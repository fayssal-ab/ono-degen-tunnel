import test from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../lib/origin";
const site = "https://onodegentunnel.netlify.app";
test("Netlify public Host is accepted even when the function URL is internal", () => {
  const request = new Request("http://localhost:3000/api/auth/login", { headers: { origin: site, host: "onodegentunnel.netlify.app" } });
  assert.equal(sameOrigin(request, undefined, true), true);
  assert.equal(sameOrigin(request, "https://other.example", true), true);
});
test("cross-origin and downgraded HTTP login attempts are rejected", () => {
  for (const origin of ["https://evil.example", "http://onodegentunnel.netlify.app", "null"]) {
    const request = new Request(site + "/api/auth/login", { headers: { origin, host: "onodegentunnel.netlify.app" } });
    assert.equal(sameOrigin(request, site, true), false);
  }
});
test("local development and same-origin requests without Origin remain usable", () => {
  assert.equal(sameOrigin(new Request("http://localhost:3100/api/auth/login", { headers: { origin: "http://localhost:3100", host: "localhost:3100" } })), true);
  assert.equal(sameOrigin(new Request(site + "/api/auth/login"), site, true), true);
  assert.equal(sameOrigin(new Request(site + "/api/auth/login", { headers: { "sec-fetch-site": "cross-site" } }), site, true), false);
});
