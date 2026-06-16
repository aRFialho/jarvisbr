import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyUserToken } from "./tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      name: string;
    };
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Token de usuario ausente." });
  }

  try {
    request.user = verifyUserToken(header.slice("Bearer ".length));
  } catch {
    return reply.code(401).send({ error: "Token de usuario invalido." });
  }
}
