import { query } from "../db/pool.js";

type AuditInput = {
  userId?: string | null;
  deviceId?: string | null;
  commandId?: string | null;
  action: string;
  details?: Record<string, unknown>;
};

export async function auditLog(input: AuditInput) {
  await query(
    `INSERT INTO audit_logs(user_id, device_id, command_id, action, details_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.userId ?? null, input.deviceId ?? null, input.commandId ?? null, input.action, input.details ?? {}]
  );
}
