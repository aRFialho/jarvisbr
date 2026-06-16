import { query, pool } from "../db/pool.js";

async function cleanupExpiredRows() {
  await query(
    `UPDATE confirmation_requests
     SET status = 'expired'
     WHERE status = 'pending' AND expires_at < NOW()`
  );
  await query(
    `UPDATE execution_tokens
     SET status = 'expired'
     WHERE status = 'active' AND expires_at < NOW()`
  );
  await query(
    `DELETE FROM device_pairing_codes
     WHERE consumed_at IS NOT NULL OR expires_at < NOW() - INTERVAL '1 hour'`
  );
}

async function main() {
  console.log("jarvis-worker iniciado");
  await cleanupExpiredRows();
  setInterval(() => {
    cleanupExpiredRows().catch((error) => console.error("worker cleanup failed", error));
  }, 60_000);
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
