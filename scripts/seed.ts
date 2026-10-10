// Seed script — intentionally minimal. The site ships with NO fabricated
// content: every feature shows a designed empty state until real data arrives
// (via the admin panels, the casino provider, or the Kick webhook).
//
// This only sets safe defaults:
//   • leaderboard hidden by default (turn it on in Admin → Settings once a
//     real board is running)
//
//   npm run seed
import mysql from "mysql2/promise";

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`${name} must be set`);
  return v;
}

async function main() {
  const conn = await mysql.createConnection({
    host: env("DB_HOST", "localhost"),
    port: Number(env("DB_PORT", "3306")),
    user: env("DB_USER", "root"),
    password: process.env.DB_PASSWORD ?? "",
    database: env("DB_NAME", "ono_degen_tunnel"),
    multipleStatements: true,
  });

  // Default the leaderboard to hidden (coming-soon state) until a real board
  // is set up. Does not overwrite an existing choice.
  await conn.query(
    "INSERT INTO site_settings (`key`, value) VALUES ('leaderboard_enabled', CAST('false' AS JSON)) ON DUPLICATE KEY UPDATE value = value"
  );

  await conn.end();
  console.log("Seed complete (defaults only — no demo content).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
