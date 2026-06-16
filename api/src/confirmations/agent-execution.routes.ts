import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireDeviceAuth } from "../devices/device-auth.middleware.js";
import { query, withTransaction } from "../db/pool.js";
import { assertExecutionToken } from "./confirmation.service.js";
import { auditLog } from "../audit/audit.service.js";
import { hashExecutionToken } from "../security/execution-token.js";

const verifySchema = z.object({
  commandId: z.string().uuid(),
  executionToken: z.string().min(20)
});

const completeSchema = verifySchema.extend({
  status: z.enum(["completed", "failed", "blocked"]),
  message: z.string().max(1000).optional()
});

export async function agentExecutionRoutes(app: FastifyInstance) {
  app.post("/agent/execution/verify", { preHandler: requireDeviceAuth }, async (request, reply) => {
    const body = verifySchema.parse(request.body);

    try {
      const step = await stepForCommand(body.commandId);
      const payload = step?.payload_json as Record<string, unknown> | undefined;
      if (!step || payload?.sourceDeviceId !== request.device!.deviceId) {
        return reply.code(403).send({ error: "Este aparelho nao esta autorizado para executar este comando." });
      }

      const token = await assertExecutionToken({ commandId: body.commandId, token: body.executionToken });
      await auditLog({
        userId: request.device!.userId,
        deviceId: request.device!.deviceId,
        commandId: body.commandId,
        action: "execution.verified",
        details: { tokenId: token.id }
      });
      return { ok: true, step };
    } catch (error) {
      await auditLog({
        userId: request.device!.userId,
        deviceId: request.device!.deviceId,
        commandId: body.commandId,
        action: "execution.blocked",
        details: { reason: error instanceof Error ? error.message : "invalid_token" }
      });
      return reply.code(403).send({ error: error instanceof Error ? error.message : "Execucao bloqueada." });
    }
  });

  app.post("/agent/execution/complete", { preHandler: requireDeviceAuth }, async (request, reply) => {
    const body = completeSchema.parse(request.body);

    try {
      await assertExecutionToken({ commandId: body.commandId, token: body.executionToken });
      const tokenHash = hashExecutionToken(body.executionToken);

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE execution_tokens
           SET status = 'used', used_at = NOW()
           WHERE command_id = $1 AND token_hash = $2 AND status = 'active'`,
          [body.commandId, tokenHash]
        );
        await client.query("UPDATE command_steps SET status = $2 WHERE command_id = $1", [
          body.commandId,
          body.status
        ]);
        await client.query("UPDATE commands SET status = $2, updated_at = NOW() WHERE id = $1", [
          body.commandId,
          body.status
        ]);
      });

      await auditLog({
        userId: request.device!.userId,
        deviceId: request.device!.deviceId,
        commandId: body.commandId,
        action: `execution.${body.status}`,
        details: { message: body.message ?? null }
      });
      return { ok: true };
    } catch (error) {
      return reply.code(403).send({ error: error instanceof Error ? error.message : "Nao foi possivel finalizar." });
    }
  });
}

async function stepForCommand(commandId: string) {
  const result = await query(
    `SELECT id, command_id, tool_name, human_summary, payload_json, status
     FROM command_steps
     WHERE command_id = $1
     ORDER BY step_order ASC
     LIMIT 1`,
    [commandId]
  );
  return result.rows[0];
}
