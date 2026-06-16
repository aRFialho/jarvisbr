import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "./auth.middleware.js";
import { query } from "../db/pool.js";
import { auditLog } from "../audit/audit.service.js";

const updateSettingsSchema = z.object({
  assistantName: z.string().min(2).max(80).optional(),
  wakePhrases: z.array(z.string().min(2).max(80)).min(1).max(5).optional(),
  responseTone: z.string().min(2).max(80).optional(),
  humorLevel: z.number().min(0).max(1).optional(),
  slangLevel: z.number().min(0).max(1).optional(),
  answerLength: z.enum(["curta_objetiva", "equilibrada", "detalhada"]).optional(),
  assistantAvatarUrl: z.string().url().or(z.literal("")).optional(),
  agentAvatarUrl: z.string().url().or(z.literal("")).optional(),
  floatingButtonEnabled: z.boolean().optional(),
  alwaysListeningEnabled: z.boolean().optional()
});

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/me/settings", { preHandler: requireAuth }, async (request) => {
    const settings = await query(
      `SELECT assistant_name, wake_phrases, response_tone,
              require_confirmation_for_all_actions, floating_button_enabled, always_listening_enabled,
              humor_level, slang_level, answer_length, assistant_avatar_url, agent_avatar_url, agent_install_mode
       FROM user_settings
       WHERE user_id = $1`,
      [request.user!.id]
    );
    const voices = await query(
      `SELECT id, provider, voice_name, gender_style, speed, pitch, enabled
       FROM assistant_voice_profiles
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [request.user!.id]
    );

    return { settings: settings.rows[0], voices: voices.rows };
  });

  app.patch("/me/settings", { preHandler: requireAuth }, async (request) => {
    const body = updateSettingsSchema.parse(request.body);

    const result = await query(
      `UPDATE user_settings
       SET assistant_name = COALESCE($2, assistant_name),
           wake_phrases = COALESCE($3, wake_phrases),
           response_tone = COALESCE($4, response_tone),
           floating_button_enabled = COALESCE($5, floating_button_enabled),
           always_listening_enabled = COALESCE($6, always_listening_enabled),
           humor_level = COALESCE($7, humor_level),
           slang_level = COALESCE($8, slang_level),
           answer_length = COALESCE($9, answer_length),
           assistant_avatar_url = COALESCE($10, assistant_avatar_url),
           agent_avatar_url = COALESCE($11, agent_avatar_url),
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING assistant_name, wake_phrases, response_tone,
                 require_confirmation_for_all_actions, floating_button_enabled, always_listening_enabled,
                 humor_level, slang_level, answer_length, assistant_avatar_url, agent_avatar_url, agent_install_mode`,
      [
        request.user!.id,
        body.assistantName ?? null,
        body.wakePhrases ?? null,
        body.responseTone ?? null,
        body.floatingButtonEnabled ?? null,
        body.alwaysListeningEnabled ?? null,
        body.humorLevel ?? null,
        body.slangLevel ?? null,
        body.answerLength ?? null,
        body.assistantAvatarUrl ?? null,
        body.agentAvatarUrl ?? null
      ]
    );

    await auditLog({ userId: request.user!.id, action: "settings.updated", details: body });
    return { settings: result.rows[0] };
  });
}
