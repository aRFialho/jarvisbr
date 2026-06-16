import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware.js";
import { auditLog } from "../audit/audit.service.js";
import { query } from "../db/pool.js";
import { createPairingCode, claimDevice } from "./devices.service.js";

const pairingSchema = z.object({
  requestedDeviceName: z.string().min(2).max(120).optional()
});

const claimSchema = z.object({
  code: z.string().min(6).max(12),
  friendlyName: z.string().min(2).max(120),
  deviceType: z.enum(["mobile", "desktop", "notebook", "tablet", "web"]),
  platform: z.string().min(2).max(60),
  publicKey: z.string().min(4).max(2000)
});

export async function deviceRoutes(app: FastifyInstance) {
  app.post("/devices/pairing-code", { preHandler: requireAuth }, async (request) => {
    const body = pairingSchema.parse(request.body);
    const pairing = await createPairingCode(request.user!.id, body.requestedDeviceName);
    await auditLog({
      userId: request.user!.id,
      action: "device.pairing_code_created",
      details: { requestedDeviceName: body.requestedDeviceName, expiresAt: pairing.expiresAt }
    });
    return pairing;
  });

  app.post("/devices/claim", async (request, reply) => {
    const body = claimSchema.parse(request.body);
    try {
      const claimed = await claimDevice(body);
      await auditLog({
        userId: claimed.device.user_id,
        deviceId: claimed.device.id,
        action: "device.claimed",
        details: { friendlyName: claimed.device.friendly_name, platform: claimed.device.platform }
      });
      return reply.code(201).send(claimed);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Falha ao parear aparelho." });
    }
  });

  app.get("/devices", { preHandler: requireAuth }, async (request) => {
    const devices = await query(
      `SELECT d.id, d.friendly_name, d.device_type, d.platform, d.status, d.last_seen_at, d.created_at,
              COALESCE(json_agg(json_build_object('capability', dc.capability, 'enabled', dc.enabled))
                       FILTER (WHERE dc.id IS NOT NULL), '[]') AS capabilities
       FROM devices d
       LEFT JOIN device_capabilities dc ON dc.device_id = d.id
       WHERE d.user_id = $1
       GROUP BY d.id
       ORDER BY d.created_at DESC`,
      [request.user!.id]
    );

    return { devices: devices.rows };
  });
}
