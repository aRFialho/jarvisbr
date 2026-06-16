import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/auth.middleware.js";
import { query } from "../db/pool.js";

export async function serviceRoutes(app: FastifyInstance) {
  app.get("/service/health", { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id;
    const devices = await query<{
      total: string;
      online: string;
      desktop_agents: string;
      mobile_devices: string;
    }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'online') AS online,
              COUNT(*) FILTER (WHERE device_type IN ('desktop','notebook')) AS desktop_agents,
              COUNT(*) FILTER (WHERE device_type = 'mobile') AS mobile_devices
       FROM devices
       WHERE user_id = $1`,
      [userId]
    );
    const confirmations = await query<{ pending: string; confirmed_today: string }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending,
              COUNT(*) FILTER (WHERE status = 'confirmed' AND confirmed_at > NOW() - INTERVAL '24 hours') AS confirmed_today
       FROM confirmation_requests
       WHERE user_id = $1`,
      [userId]
    );
    const commands = await query<{ total_today: string; blocked_today: string }>(
      `SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS total_today,
              COUNT(*) FILTER (WHERE status IN ('blocked','failed','rejected') AND created_at > NOW() - INTERVAL '24 hours') AS blocked_today
       FROM commands
       WHERE user_id = $1`,
      [userId]
    );

    return {
      api: "online",
      database: "connected",
      devices: normalizeCounts(devices.rows[0]),
      confirmations: normalizeCounts(confirmations.rows[0]),
      commands: normalizeCounts(commands.rows[0]),
      checkedAt: new Date().toISOString()
    };
  });

  app.get("/install/manifest", { preHandler: requireAuth }, async () => {
    const result = await query(
      `SELECT artifact_type, version, download_url, checksum_sha256, enabled, updated_at
       FROM install_artifacts
       WHERE enabled = TRUE
       ORDER BY artifact_type, created_at DESC`
    );

    return {
      artifacts: result.rows,
      androidApkUrl: process.env.ANDROID_APK_URL ?? null,
      windowsAgentUrl: process.env.WINDOWS_AGENT_URL ?? null
    };
  });

  app.get("/install/public-manifest", async () => {
    return {
      androidApkUrl: process.env.ANDROID_APK_URL ?? null,
      windowsAgentUrl: process.env.WINDOWS_AGENT_URL ?? null,
      note: "URLs publicas de instalacao. O APK real deve ser publicado conscientemente pelo dono do projeto."
    };
  });
}

function normalizeCounts(row: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? Number(value) : value])
  );
}
