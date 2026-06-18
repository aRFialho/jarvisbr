import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware.js";
import { auditLog } from "../audit/audit.service.js";
import { query } from "../db/pool.js";
import { ensureWebDeviceForUser } from "../devices/devices.service.js";
import { createFileDownloadConfirmation } from "../confirmations/confirmation.service.js";
import { mockFileSearchResults, searchCachedFiles } from "../files/search.service.js";
import { getWebSocketHub } from "../websocket/hub.js";
import { buildAssistantReply, type AssistantMemory } from "../ai/conversation.service.js";
import { interpretCommand } from "./intent.js";

const createCommandSchema = z.object({
  rawText: z.string().min(2).max(2000),
  sourceDeviceId: z.string().uuid().optional()
});

const searchSchema = z.object({
  query: z.string().min(1).max(160).optional(),
  requestedKind: z.string().max(40).optional(),
  targetDeviceId: z.string().uuid().optional(),
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

    const userId = request.user!.id;
    const sourceDeviceId = body.sourceDeviceId ?? (await ensureWebDeviceForUser(userId));
    const initialStatus = interpreted.intent === "conversation" ? "completed" : "search_pending";
    const riskLevel = interpreted.intent === "conversation" ? "low" : "medium";
    const command = await query(
      `INSERT INTO commands(user_id, source_device_id, target_device_id, raw_text, interpreted_intent, status, risk_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, raw_text, interpreted_intent, target_device_id, status, risk_level, created_at`,
      [userId, sourceDeviceId, interpreted.targetDeviceId, body.rawText, interpreted.intent, initialStatus, riskLevel]
    );

    const conversation = interpreted.intent === "conversation"
      ? await createConversationReply(userId, body.rawText)
      : null;

    await auditLog({
      userId,
      commandId: String(command.rows[0].id),
      action: interpreted.intent === "conversation" ? "conversation.replied" : "command.created",
      details: { interpreted, hasReply: Boolean(conversation?.reply) }
    });

    return reply.code(201).send({
      command: command.rows[0],
      interpreted,
      reply: conversation?.reply,
      holoState: interpreted.intent === "conversation" ? "done" : interpreted.needsDeviceSelection ? "thinking" : "searching"
    });
  });

  app.post("/commands/:id/search-files", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = searchSchema.parse(request.body);
    const command = await getCommandForUser(params.id, request.user!.id);
    if (!command) {
      return reply.code(404).send({ error: "Comando nao encontrado." });
    }
    const targetDeviceId = command.target_device_id ?? body.targetDeviceId ?? null;
    if (!targetDeviceId) {
      return reply.code(400).send({ error: "Diga o nome do aparelho ou mencione com @ antes da busca." });
    }
    const targetDevice = await ensureOwnedDevice(request.user!.id, targetDeviceId);
    if (!targetDevice) {
      return reply.code(400).send({ error: "Aparelho alvo nao encontrado para esta conta." });
    }
    if (!command.target_device_id) {
      await query("UPDATE commands SET target_device_id = $2, updated_at = NOW() WHERE id = $1", [
        command.id,
        targetDeviceId
      ]);
    }

    const interpreted = interpretCommand(command.raw_text, []);
    const searchQuery = body.query ?? interpreted.query;
    const requestedKind = body.requestedKind ?? interpreted.requestedKind;

    const searchRequest = await query<{ id: string }>(
      `INSERT INTO file_search_requests(command_id, target_device_id, query, requested_kind)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [command.id, targetDeviceId, searchQuery, requestedKind ?? null]
    );

    const hub = getWebSocketHub();
    const agentResults = await hub.requestFileSearch({
      userId: request.user!.id,
      deviceId: targetDeviceId,
      requestId: searchRequest.rows[0].id,
      query: searchQuery,
      requestedKind,
      limit: body.limit ?? 10
    });

    let results = agentResults && agentResults.length > 0
      ? agentResults
      : await searchCachedFiles({
          userId: request.user!.id,
          deviceId: targetDeviceId,
          query: searchQuery,
          requestedKind,
          limit: body.limit ?? 10
        });

    if (results.length === 0) {
      results = mockFileSearchResults({ deviceId: targetDeviceId, query: searchQuery, requestedKind });
    }

    await query("UPDATE file_search_requests SET status = 'completed', completed_at = NOW() WHERE id = $1", [
      searchRequest.rows[0].id
    ]);
    await query("UPDATE commands SET status = 'awaiting_file_selection', updated_at = NOW() WHERE id = $1", [
      command.id
    ]);
    await auditLog({
      userId: request.user!.id,
      deviceId: targetDeviceId,
      commandId: command.id,
      action: "file.search.completed",
      details: {
        query: searchQuery,
        resultCount: results.length,
        usedAgent: Boolean(agentResults?.length),
        targetDeviceName: targetDevice.friendly_name
      }
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

async function ensureOwnedDevice(userId: string, deviceId: string) {
  const result = await query<{ id: string; friendly_name: string }>(
    "SELECT id, friendly_name FROM devices WHERE id = $1 AND user_id = $2",
    [deviceId, userId]
  );

  return result.rows[0] ?? null;
}

async function createConversationReply(userId: string, rawText: string) {
  const context = await getConversationContext(userId);
  const conversation = buildAssistantReply(rawText, context);

  if (conversation.memoryWrite) {
    try {
      await query(
        `INSERT INTO assistant_personality_memory(user_id, memory_type, content, confidence, approved_by_user)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [userId, conversation.memoryWrite.memoryType, conversation.memoryWrite.content, 0.92]
      );
    } catch {
      // Conversa nao deve falhar se a memoria ainda nao estiver disponivel.
    }
  }

  return conversation;
}

async function getConversationContext(userId: string) {
  const settings = await query<{ assistant_name: string }>(
    "SELECT assistant_name FROM user_settings WHERE user_id = $1",
    [userId]
  );

  let memories: AssistantMemory[] = [];
  try {
    const memoryResult = await query<AssistantMemory>(
      `SELECT memory_type, content
       FROM assistant_personality_memory
       WHERE user_id = $1 AND approved_by_user = TRUE
       ORDER BY updated_at DESC
       LIMIT 8`,
      [userId]
    );
    memories = memoryResult.rows;
  } catch {
    memories = [];
  }

  return {
    assistantName: settings.rows[0]?.assistant_name ?? "Jarvis",
    memories
  };
}
