import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { authRoutes } from "./auth/auth.routes.js";
import { settingsRoutes } from "./auth/settings.routes.js";
import { deviceRoutes } from "./devices/devices.routes.js";
import { commandRoutes } from "./commands/commands.routes.js";
import { confirmationRoutes } from "./confirmations/confirmation.routes.js";
import { agentExecutionRoutes } from "./confirmations/agent-execution.routes.js";
import { auditRoutes } from "./audit/audit.routes.js";
import { websocketRoutes } from "./websocket/hub.js";

export async function buildApp() {
  const app = Fastify({
    logger: env.nodeEnv !== "test"
  });

  await app.register(cors, {
    origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(",").map((origin) => origin.trim()),
    credentials: true
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Entrada invalida.", issues: error.issues });
    }

    app.log.error(error);
    return reply.code(500).send({ error: "Erro interno do Jarvis API." });
  });

  app.get("/health", async () => ({ ok: true, service: "jarvis-api" }));

  await websocketRoutes(app);
  await authRoutes(app);
  await settingsRoutes(app);
  await deviceRoutes(app);
  await commandRoutes(app);
  await confirmationRoutes(app);
  await agentExecutionRoutes(app);
  await auditRoutes(app);

  return app;
}
