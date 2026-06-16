import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL ?? "";

if (!databaseUrl) {
  throw new Error("DATABASE_URL nao configurada. Configure com a connection string do Neon.");
}

function sslFor(connectionString: string) {
  return connectionString.includes("sslmode=require") || connectionString.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined;
}

async function ensureMigrationTable(client: pg.Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(120) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function hasMigration(client: pg.Client, version: string) {
  const result = await client.query("SELECT version FROM schema_migrations WHERE version = $1", [version]);
  return (result.rowCount ?? 0) > 0;
}

async function main() {
  const client = new Client({ connectionString: databaseUrl, ssl: sslFor(databaseUrl) });
  await client.connect();

  try {
    await ensureMigrationTable(client);
    const migrationsDir = path.resolve(process.cwd(), "db", "migrations");
    const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

    for (const file of files) {
      const version = file.replace(".sql", "");
      if (await hasMigration(client, version)) {
        console.log(`skip ${version}`);
        continue;
      }

      console.log(`apply ${version}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [version]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
