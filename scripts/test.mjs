import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run each suite directly so all nested tests are reported on Node 22/tsx.
for (const file of readdirSync("tests").filter((name) => name.endsWith(".test.ts")).sort()) {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", `tests/${file}`], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
