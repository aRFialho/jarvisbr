import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { verifyDeviceToken, verifyUserToken } from "../auth/tokens.js";
import { query } from "../db/pool.js";
import { auditLog } from "../audit/audit.service.js";
import type { FileSearchResult } from "../types.js";

type AnySocket = {
  send: (data: string) => void;
  close: () => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  readyState?: number;
};

type PendingFileSearch = {
  resolve: (results: FileSearchResult[]) => void;
  timeout: NodeJS.Timeout;
};

export class WebSocketHub {
  private agents = new Map<string, AnySocket>();
  private clients = new Map<string, Set<AnySocket>>();
  private pendingFileSearches = new Map<string, PendingFileSearch>();

  registerAgent(deviceId: string, socket: AnySocket) {
    this.agents.set(deviceId, socket);
  }

  removeAgent(deviceId: string, socket: AnySocket) {
    if (this.agents.get(deviceId) === socket) {
      this.agents.delete(deviceId);
    }
  }

  registerClient(userId: string, socket: AnySocket) {
    const set = this.clients.get(userId) ?? new Set<AnySocket>();
    set.add(socket);
    this.clients.set(userId, set);
  }

  removeClient(userId: string, socket: AnySocket) {
    const set = this.clients.get(userId);
    set?.delete(socket);
    if (set?.size === 0) {
      this.clients.delete(userId);
    }
  }

  broadcastToClients(userId: string, payload: Record<string, unknown>) {
    const data = JSON.stringify(payload);
    for (const socket of this.clients.get(userId) ?? []) {
      socket.send(data);
    }
  }

  async requestFileSearch(input: {
    userId: string;
    deviceId: string;
    requestId: string;
    query: string;
    requestedKind?: string;
    limit?: number;
  }) {
    const agent = this.agents.get(input.deviceId);
    if (!agent) {
      return null;
    }

    const payload = {
      type: "file.search.request",
      requestId: input.requestId,
      query: input.query,
      requestedKind: input.requestedKind,
      limit: input.limit ?? 10
    };

    return new Promise<FileSearchResult[]>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingFileSearches.delete(input.requestId);
        resolve([]);
      }, 1800);

      this.pendingFileSearches.set(input.requestId, { resolve, timeout });
      agent.send(JSON.stringify(payload));
    });
  }

  resolveFileSearch(userId: string, requestId: string, results: FileSearchResult[]) {
    const pending = this.pendingFileSearches.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingFileSearches.delete(requestId);
    pending.resolve(results);
    this.broadcastToClients(userId, { type: "file.search.results", requestId, results });
  }

  sendActionExecute(input: {
    userId: string;
    commandId: string;
    executionToken: string;
    step: Record<string, unknown>;
  }) {
    const payloadJson = (input.step.payload_json ?? input.step.payloadJson ?? {}) as Record<string, unknown>;
    const sourceDeviceId = String(payloadJson.sourceDeviceId ?? "");
    const agent = this.agents.get(sourceDeviceId);
    const message = {
      type: "action.execute",
      commandId: input.commandId,
      executionToken: input.executionToken,
      step: input.step
    };

    if (agent) {
      agent.send(JSON.stringify(message));
    }

    this.broadcastToClients(input.userId, {
      type: "confirmation.confirmed",
      commandId: input.commandId,
      agentOnline: Boolean(agent)
    });
  }
}

const hub = new WebSocketHub();

export function getWebSocketHub() {
  return hub;
}

const fileSearchResultsSchema = z.object({
  type: z.literal("file.search.results"),
  requestId: z.string(),
  results: z.array(
    z.object({
      localFileId: z.string(),
      fileName: z.string(),
      fileKind: z.string().default("unknown"),
      fileSize: z.number().default(0),
      filePathHint: z.string().default(""),
      modifiedAt: z.string(),
      thumbnailToken: z.string().default(""),
      score: z.number(),
      deviceId: z.string().optional()
    })
  )
});

export async function websocketRoutes(app: FastifyInstance) {
  await app.register(websocket);

  app.get("/ws/agent", { websocket: true }, (connection, request) => {
    const socket = unwrapSocket(connection);
    const token = tokenFromRequest(request);
    if (!token) {
      socket.close();
      return;
    }

    let payload: ReturnType<typeof verifyDeviceToken>;
    try {
      payload = verifyDeviceToken(token);
    } catch {
      socket.close();
      return;
    }

    hub.registerAgent(payload.deviceId, socket);
    void query("UPDATE devices SET status = 'online', last_seen_at = NOW() WHERE id = $1 AND user_id = $2", [
      payload.deviceId,
      payload.userId
    ]);
    void auditLog({
      userId: payload.userId,
      deviceId: payload.deviceId,
      action: "ws.agent_connected",
      details: { friendlyName: payload.friendlyName }
    });

    socket.on("message", (raw) => {
      void handleAgentMessage(payload.userId, payload.deviceId, raw);
    });
    socket.on("close", () => {
      hub.removeAgent(payload.deviceId, socket);
      void query("UPDATE devices SET status = 'offline', last_seen_at = NOW() WHERE id = $1", [payload.deviceId]);
    });
  });

  app.get("/ws/client", { websocket: true }, (connection, request) => {
    const socket = unwrapSocket(connection);
    const token = tokenFromRequest(request);
    if (!token) {
      socket.close();
      return;
    }

    let user: ReturnType<typeof verifyUserToken>;
    try {
      user = verifyUserToken(token);
    } catch {
      socket.close();
      return;
    }

    hub.registerClient(user.id, socket);
    socket.send(JSON.stringify({ type: "client.connected", userId: user.id }));
    socket.on("close", () => hub.removeClient(user.id, socket));
  });
}

async function handleAgentMessage(userId: string, deviceId: string, raw: unknown) {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }

  const search = fileSearchResultsSchema.safeParse(parsed);
  if (search.success) {
    const results = search.data.results.map((item) => ({ ...item, deviceId: item.deviceId ?? deviceId }));
    await upsertFileCache(userId, deviceId, results);
    hub.resolveFileSearch(userId, search.data.requestId, results);
    return;
  }

  if (typeof parsed === "object" && parsed && "type" in parsed) {
    hub.broadcastToClients(userId, parsed as Record<string, unknown>);
  }
}

async function upsertFileCache(userId: string, deviceId: string, results: FileSearchResult[]) {
  for (const item of results) {
    await query(
      `INSERT INTO file_index_cache(
         user_id, device_id, local_file_id, file_name, file_ext, file_kind,
         file_size, file_path_hint, modified_at, thumbnail_token, last_seen_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (device_id, local_file_id)
       DO UPDATE SET file_name = EXCLUDED.file_name,
                     file_ext = EXCLUDED.file_ext,
                     file_kind = EXCLUDED.file_kind,
                     file_size = EXCLUDED.file_size,
                     file_path_hint = EXCLUDED.file_path_hint,
                     modified_at = EXCLUDED.modified_at,
                     thumbnail_token = EXCLUDED.thumbnail_token,
                     last_seen_at = NOW()`,
      [
        userId,
        deviceId,
        item.localFileId,
        item.fileName,
        item.fileName.split(".").pop()?.toLowerCase() ?? null,
        item.fileKind,
        item.fileSize,
        item.filePathHint,
        item.modifiedAt,
        item.thumbnailToken
      ]
    );
  }
}

function unwrapSocket(connection: unknown): AnySocket {
  const maybe = connection as { socket?: AnySocket };
  return maybe.socket ?? (connection as AnySocket);
}

function tokenFromRequest(request: { raw: { url?: string } }) {
  const url = new URL(request.raw.url ?? "", "http://jarvis.local");
  return url.searchParams.get("token");
}
