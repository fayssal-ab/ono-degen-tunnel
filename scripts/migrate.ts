// Migration runner. Applies db/migrations/*.sql in filename order, tracking
// applied files in `schema_migrations` so each runs exactly once.
//   npm run migrate            apply pending
//   npm run migrate -- --fresh DROP the database first, then apply all
//
// Env comes from .env.local via `node --env-file-if-exists` (see package.json).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`${name} must be set (copy .env.example to .env.local)`);
  return v;
}

async function main() {
  const fresh = process.argv.includes("--fresh");
  const host = env("DB_HOST", "localhost");
  const port = Number(env("DB_PORT", "3306"));
  const user = env("DB_USER", "root");
  const password = process.env.DB_PASSWORD ?? "";
  const database = env("DB_NAME", "ono_degen_tunnel");

  // Server-level connection first, so we can create the DB if it's missing.
  const root = await mysql.createConnection({ host, port, user, password, multipleStatements: true });

  if (fresh) {
    console.warn(`--fresh: dropping database \`${database}\``);
    await root.query(`DROP DATABASE IF EXISTS \`${database}\``);
  }
  await root.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.changeUser({ database });

  await root.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(191) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  const [appliedRows] = await root.query<mysql.RowDataPacket[]>("SELECT filename FROM schema_migrations");
  const applied = new Set(appliedRows.map((r) => r.filename as string));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write(`applying ${file} … `);
    try {
      await root.query(sql);
      await root.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
      count++;
      console.log("ok");
    } catch (err) {
      console.log("FAILED");
      console.error(err);
      await root.end();
      process.exit(1);
    }
  }

  await root.end();
  console.log(count === 0 ? "Already up to date." : `Applied ${count} migration(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
