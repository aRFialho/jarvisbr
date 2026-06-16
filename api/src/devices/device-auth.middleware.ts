import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyDeviceToken } from "../auth/tokens.js";
import type { DeviceTokenPayload } from "../types.js";

declare module "fastify" {
  interface FastifyRequest {
    device?: DeviceTokenPayload;
  }
}

export async function requireDeviceAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Token de aparelho ausente." });
  }

  try {
    request.device = verifyDeviceToken(header.slice("Bearer ".length));
  } catch {
    return reply.code(401).send({ error: "Token de aparelho invalido." });
  }
}
