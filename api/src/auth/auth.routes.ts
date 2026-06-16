import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../db/pool.js";
import { auditLog } from "../audit/audit.service.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signUserToken } from "./tokens.js";

const registerSchema = z.object({
  name: z.string().min(2).max(160),
  email: z.string().email().max(220).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(200)
});

const loginSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  password: z.string().min(1)
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const passwordHash = await hashPassword(body.password);

    const user = await withTransaction(async (client) => {
      const created = await client.query<{ id: string; name: string; email: string }>(
        `INSERT INTO users(name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        [body.name, body.email, passwordHash]
      );
      const row = created.rows[0];

      await client.query("INSERT INTO user_settings(user_id) VALUES ($1)", [row.id]);
      await client.query(
        `INSERT INTO hologram_presets(user_id, preset_name)
         VALUES ($1, 'Neon Holograma')`,
        [row.id]
      );
      await client.query(
        `INSERT INTO assistant_voice_profiles(user_id, voice_name, gender_style)
         VALUES ($1, 'female_br_01', 'feminina')`,
        [row.id]
      );

      return row;
    });

    await auditLog({ userId: user.id, action: "auth.registered", details: { email: user.email } });
    return reply.code(201).send({ user, token: signUserToken(user) });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await query<{ id: string; name: string; email: string; password_hash: string }>(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [body.email]
    );
    const user = result.rows[0];

    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return reply.code(401).send({ error: "E-mail ou senha invalidos." });
    }

    await auditLog({ userId: user.id, action: "auth.logged_in" });
    return {
      user: { id: user.id, name: user.name, email: user.email },
      token: signUserToken({ id: user.id, name: user.name, email: user.email })
    };
  });
}
