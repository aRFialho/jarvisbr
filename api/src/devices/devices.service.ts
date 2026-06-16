import crypto from "node:crypto";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signDeviceToken } from "../auth/tokens.js";
import { query, withTransaction } from "../db/pool.js";

export function generatePairingCode() {
  return crypto.randomInt(100000, 999999).toString();
}

export async function createPairingCode(userId: string, requestedDeviceName?: string) {
  const code = generatePairingCode();
  const codeHash = await hashPassword(code);
  const result = await query<{ id: string; expires_at: Date }>(
    `INSERT INTO device_pairing_codes(user_id, code_hash, requested_device_name, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')
     RETURNING id, expires_at`,
    [userId, codeHash, requestedDeviceName ?? null]
  );

  return { pairingId: result.rows[0].id, code, expiresAt: result.rows[0].expires_at };
}

export async function claimDevice(input: {
  code: string;
  friendlyName: string;
  deviceType: "mobile" | "desktop" | "notebook" | "tablet" | "web";
  platform: string;
  publicKey: string;
}) {
  const activeCodes = await query<{
    id: string;
    user_id: string;
    code_hash: string;
    requested_device_name: string | null;
  }>(
    `SELECT id, user_id, code_hash, requested_device_name
     FROM device_pairing_codes
     WHERE consumed_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 30`
  );

  const match = await asyncFind(activeCodes.rows, (row) => verifyPassword(input.code, row.code_hash));
  if (!match) {
    throw new Error("Codigo de pareamento invalido ou expirado.");
  }

  const friendlyName = input.friendlyName || match.requested_device_name || "Aparelho";
  const device = await withTransaction(async (client) => {
    const created = await client.query<{
      id: string;
      user_id: string;
      friendly_name: string;
      device_type: string;
      platform: string;
      status: string;
      created_at: Date;
    }>(
      `INSERT INTO devices(user_id, friendly_name, device_type, platform, public_key, status, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, 'online', NOW())
       RETURNING id, user_id, friendly_name, device_type, platform, status, created_at`,
      [match.user_id, friendlyName, input.deviceType, input.platform, input.publicKey]
    );

    const deviceRow = created.rows[0];
    const capabilities = input.deviceType === "web" || input.deviceType === "mobile"
      ? ["client_commands", "receive_files"]
      : ["file_search", "file_transfer", "thumbnail_preview"];

    for (const capability of capabilities) {
      await client.query(
        `INSERT INTO device_capabilities(device_id, capability)
         VALUES ($1, $2)
         ON CONFLICT (device_id, capability) DO UPDATE SET enabled = TRUE`,
        [deviceRow.id, capability]
      );
    }

    await client.query(
      `INSERT INTO device_permissions(device_id, permission_scope, permission_value)
       VALUES ($1, 'file_kind', 'image'), ($1, 'file_kind', 'document'), ($1, 'action', 'file_download')
       ON CONFLICT DO NOTHING`,
      [deviceRow.id]
    );
    await client.query("UPDATE device_pairing_codes SET consumed_at = NOW() WHERE id = $1", [match.id]);

    return deviceRow;
  });

  return {
    device,
    token: signDeviceToken({ userId: device.user_id, deviceId: device.id, friendlyName: device.friendly_name })
  };
}

export async function ensureWebDeviceForUser(userId: string) {
  const existing = await query<{ id: string }>(
    `SELECT id FROM devices
     WHERE user_id = $1 AND device_type = 'web'
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const created = await query<{ id: string }>(
    `INSERT INTO devices(user_id, friendly_name, device_type, platform, public_key, status, last_seen_at)
     VALUES ($1, 'Painel Web', 'web', 'browser', 'local-web-session', 'online', NOW())
     RETURNING id`,
    [userId]
  );

  return created.rows[0].id;
}

async function asyncFind<T>(items: T[], predicate: (item: T) => Promise<boolean>) {
  for (const item of items) {
    if (await predicate(item)) {
      return item;
    }
  }
  return undefined;
}
