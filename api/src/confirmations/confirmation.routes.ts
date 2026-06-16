import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware.js";
import { query } from "../db/pool.js";
import { confirmAction, rejectAction } from "./confirmation.service.js";
import { getWebSocketHub } from "../websocket/hub.js";

const confirmSchema = z.object({
  phrase: z.string().min(2).max(120)
});

const rejectSchema = z.object({
  reason: z.string().max(240).optional()
});

export async function confirmationRoutes(app: FastifyInstance) {
  app.get("/confirmations/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query(
      `SELECT id, command_id, summary, confirmation_phrase, status, expires_at, confirmed_at, rejected_at, created_at
       FROM confirmation_requests
       WHERE id = $1 AND user_id = $2`,
      [params.id, request.user!.id]
    );

    if (!result.rows[0]) {
      return reply.code(404).send({ error: "Confirmacao nao encontrada." });
    }

    return { confirmation: result.rows[0] };
  });

  app.post("/confirmations/:id/confirm", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = confirmSchema.parse(request.body);

    try {
      const confirmed = await confirmAction({
        confirmationId: params.id,
        userId: request.user!.id,
        phrase: body.phrase
      });

      getWebSocketHub().sendActionExecute({
        userId: request.user!.id,
        commandId: confirmed.confirmation.command_id,
        executionToken: confirmed.executionToken,
        step: confirmed.step
      });

      return {
        confirmation: confirmed.confirmation,
        executionTokenExpiresAt: confirmed.executionExpiresAt,
        step: confirmed.step
      };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Falha ao confirmar acao." });
    }
  });

  app.post("/confirmations/:id/reject", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = rejectSchema.parse(request.body);

    try {
      const rejected = await rejectAction({ confirmationId: params.id, userId: request.user!.id, reason: body.reason });
      return { confirmation: rejected };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Falha ao rejeitar acao." });
    }
  });
}
