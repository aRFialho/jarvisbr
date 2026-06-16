import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/auth.middleware.js";
import { query } from "../db/pool.js";

export async function auditRoutes(app: FastifyInstance) {
  app.get("/audit", { preHandler: requireAuth }, async (request) => {
    const result = await query(
      `SELECT id, device_id, command_id, action, details_json, created_at
       FROM audit_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [request.user!.id]
    );

    return { audit: result.rows };
  });
}
