import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // Existing browser initialization effects predate React Compiler rules.
  // Keep these visible as warnings while enforcing all other lint checks.
  { rules: { "react-hooks/set-state-in-effect": "warn" } },
  { files: ["lib/sync.ts"], rules: { "prefer-const": "warn" } },
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts", "scripts/gen-*.mjs"]),
]);
