import "dotenv/config";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL nao configurada.");
}

const ssl = databaseUrl.includes("sslmode=require") || databaseUrl.includes("neon.tech")
  ? { rejectUnauthorized: false }
  : undefined;

const client = new Client({ connectionString: databaseUrl, ssl });

try {
  await client.connect();
  const result = await client.query("SELECT NOW() AS now");
  console.log(`database ok: ${result.rows[0].now.toISOString()}`);
} finally {
  await client.end();
}
