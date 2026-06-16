import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware.js";
import { auditLog } from "../audit/audit.service.js";
import { query } from "../db/pool.js";
import { ensureWebDeviceForUser } from "../devices/devices.service.js";
import { createFileDownloadConfirmation } from "../confirmations/confirmation.service.js";
import { mockFileSearchResults, searchCachedFiles } from "../files/search.service.js";
import { getWebSocketHub } from "../websocket/hub.js";
import { interpretCommand } from "./intent.js";

const createCommandSchema = z.object({
  rawText: z.string().min(2).max(2000),
  sourceDeviceId: z.string().uuid().optional()
});

const searchSchema = z.object({
  query: z.string().min(1).max(160).optional(),
  requestedKind: z.string().max(40).optional(),
  limit: z.number().int().min(1).max(20).optional()
});

const selectFileSchema = z.object({
  localFileId: z.string().min(1).max(240),
  fileName: z.string().min(1).max(500),
  fileSize: z.number().optional(),
  sourceDeviceId: z.string().uuid().optional(),
  destinationDeviceId: z.string().uuid().optional()
});

export async function commandRoutes(app: FastifyInstance) {
  app.post("/commands", { preHandler: requireAuth }, async (request, reply) => {
    const body = createCommandSchema.parse(request.body);
    const devices = await query<{ id: string; friendly_name: string; device_type: string }>(
      "SELECT id, friendly_name, device_type FROM devices WHERE user_id = $1",
      [request.user!.id]
    );
    const interpreted = interpretCommand(body.rawText, devices.rows);

    const sourceDeviceId = body.sourceDeviceId ?? (await ensureWebDeviceForUser(request.user!.id));
    const command = await query(
      `INSERT INTO commands(user_id, source_device_id, target_device_id, raw_text, interpreted_intent, status, risk_level)
       VALUES ($1, $2, $3, $4, $5, 'search_pending', 'medium')
       RETURNING id, raw_text, interpreted_intent, target_device_id, status, risk_level, created_at`,
      [request.user!.id, sourceDeviceId, interpreted.targetDeviceId, body.rawText, interpreted.intent]
    );

    await auditLog({
      userId: request.user!.id,
      commandId: String(command.rows[0].id),
      action: "command.created",
      details: { interpreted }
    });

    return reply.code(201).send({
      command: command.rows[0],
      interpreted,
      holoState: interpreted.needsDeviceSelection ? "thinking" : "searching"
    });
  });

  app.post("/commands/:id/search-files", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = searchSchema.parse(request.body);
    const command = await getCommandForUser(params.id, request.user!.id);
    if (!command) {
      return reply.code(404).send({ error: "Comando nao encontrado." });
    }
    if (!command.target_device_id) {
      return reply.code(400).send({ error: "Escolha um aparelho alvo antes da busca." });
    }

    const interpreted = interpretCommand(command.raw_text, []);
    const searchQuery = body.query ?? interpreted.query;
    const requestedKind = body.requestedKind ?? interpreted.requestedKind;

    const searchRequest = await query<{ id: string }>(
      `INSERT INTO file_search_requests(command_id, target_device_id, query, requested_kind)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [command.id, command.target_device_id, searchQuery, requestedKind ?? null]
    );

    const hub = getWebSocketHub();
    const agentResults = await hub.requestFileSearch({
      userId: request.user!.id,
      deviceId: command.target_device_id,
      requestId: searchRequest.rows[0].id,
      query: searchQuery,
      requestedKind,
      limit: body.limit ?? 10
    });

    let results = agentResults && agentResults.length > 0
      ? agentResults
      : await searchCachedFiles({
          userId: request.user!.id,
          deviceId: command.target_device_id,
          query: searchQuery,
          requestedKind,
          limit: body.limit ?? 10
        });

    if (results.length === 0) {
      results = mockFileSearchResults({ deviceId: command.target_device_id, query: searchQuery, requestedKind });
    }

    await query("UPDATE file_search_requests SET status = 'completed', completed_at = NOW() WHERE id = $1", [
      searchRequest.rows[0].id
    ]);
    await query("UPDATE commands SET status = 'awaiting_file_selection', updated_at = NOW() WHERE id = $1", [
      command.id
    ]);
    await auditLog({
      userId: request.user!.id,
      deviceId: command.target_device_id,
      commandId: command.id,
      action: "file.search.completed",
      details: { query: searchQuery, resultCount: results.length, usedAgent: Boolean(agentResults?.length) }
    });

    hub.broadcastToClients(request.user!.id, {
      type: "file.search.results",
      commandId: command.id,
      requestId: searchRequest.rows[0].id,
      results
    });

    return { requestId: searchRequest.rows[0].id, results, holoState: "confirming" };
  });

  app.post("/commands/:id/select-file", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = selectFileSchema.parse(request.body);
    const command = await getCommandForUser(params.id, request.user!.id);
    if (!command) {
      return reply.code(404).send({ error: "Comando nao encontrado." });
    }

    const sourceDeviceId = body.sourceDeviceId ?? command.target_device_id;
    if (!sourceDeviceId) {
      return reply.code(400).send({ error: "Aparelho origem ausente." });
    }

    const destinationDeviceId = body.destinationDeviceId ?? (await ensureWebDeviceForUser(request.user!.id));

    try {
      const created = await createFileDownloadConfirmation({
        userId: request.user!.id,
        commandId: command.id,
        sourceDeviceId,
        destinationDeviceId,
        localFileId: body.localFileId,
        fileName: body.fileName,
        fileSize: body.fileSize
      });

      getWebSocketHub().broadcastToClients(request.user!.id, {
        type: "confirmation.required",
        commandId: command.id,
        confirmation: created.confirmation
      });

      await auditLog({
        userId: request.user!.id,
        deviceId: sourceDeviceId,
        commandId: command.id,
        action: "confirmation.required",
        details: { fileName: body.fileName, confirmationId: created.confirmation.id }
      });

      return { confirmation: created.confirmation, holoState: "confirming" };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Falha ao montar confirmacao." });
    }
  });
}

async function getCommandForUser(commandId: string, userId: string) {
  const result = await query<{
    id: string;
    raw_text: string;
    target_device_id: string | null;
    source_device_id: string | null;
  }>(
    `SELECT id, raw_text, target_device_id, source_device_id
     FROM commands
     WHERE id = $1 AND user_id = $2`,
    [commandId, userId]
  );

  return result.rows[0];
}
