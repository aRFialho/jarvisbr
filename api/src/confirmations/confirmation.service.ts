import pg from "pg";
import { env } from "../config/env.js";
import { query, withTransaction } from "../db/pool.js";
import { auditLog } from "../audit/audit.service.js";
import { assertConfirmedAction, confirmationSummaryForFileDownload } from "../security/confirmation-guard.js";
import { createRawExecutionToken, hashExecutionToken } from "../security/execution-token.js";

export async function createFileDownloadConfirmation(input: {
  userId: string;
  commandId: string;
  sourceDeviceId: string;
  destinationDeviceId: string;
  localFileId: string;
  fileName: string;
  fileSize?: number;
}) {
  return withTransaction(async (client) => {
    const command = await client.query<{ target_device_id: string | null; user_id: string }>(
      "SELECT user_id, target_device_id FROM commands WHERE id = $1 FOR UPDATE",
      [input.commandId]
    );
    if (!command.rows[0] || command.rows[0].user_id !== input.userId) {
      throw new Error("Comando nao encontrado para este usuario.");
    }

    const devices = await client.query<{ id: string; friendly_name: string }>(
      `SELECT id, friendly_name FROM devices
       WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [input.userId, [input.sourceDeviceId, input.destinationDeviceId]]
    );
    const source = devices.rows.find((device) => device.id === input.sourceDeviceId);
    const destination = devices.rows.find((device) => device.id === input.destinationDeviceId);
    if (!source || !destination) {
      throw new Error("Aparelho origem/destino nao pertence ao usuario.");
    }

    const permission = await client.query(
      `SELECT id FROM device_permissions
       WHERE device_id = $1 AND permission_scope = 'action' AND permission_value = 'file_download' AND enabled = TRUE`,
      [input.sourceDeviceId]
    );
    if ((permission.rowCount ?? 0) === 0) {
      throw new Error("Aparelho origem nao esta autorizado para download de arquivo.");
    }

    const summary = confirmationSummaryForFileDownload({
      fileName: input.fileName,
      sourceDeviceName: source.friendly_name,
      destinationDeviceName: destination.friendly_name
    });

    const step = await client.query<{ id: string }>(
      `INSERT INTO command_steps(command_id, step_order, tool_name, human_summary, payload_json, status)
       VALUES ($1, 1, 'file.download', $2, $3, 'pending')
       ON CONFLICT (command_id, step_order)
       DO UPDATE SET tool_name = EXCLUDED.tool_name,
                     human_summary = EXCLUDED.human_summary,
                     payload_json = EXCLUDED.payload_json,
                     status = 'pending'
       RETURNING id`,
      [
        input.commandId,
        summary,
        {
          sourceDeviceId: input.sourceDeviceId,
          destinationDeviceId: input.destinationDeviceId,
          localFileId: input.localFileId,
          fileName: input.fileName,
          fileSize: input.fileSize ?? null
        }
      ]
    );

    const confirmation = await client.query<{
      id: string;
      summary: string;
      confirmation_phrase: string;
      status: string;
      expires_at: Date;
    }>(
      `INSERT INTO confirmation_requests(command_id, user_id, summary, confirmation_phrase, expires_at)
       VALUES ($1, $2, $3, 'Confirmo', NOW() + ($4 || ' minutes')::INTERVAL)
       RETURNING id, summary, confirmation_phrase, status, expires_at`,
      [input.commandId, input.userId, summary, env.confirmationTtlMinutes]
    );

    await client.query("UPDATE commands SET status = 'awaiting_confirmation', updated_at = NOW() WHERE id = $1", [
      input.commandId
    ]);

    return { stepId: step.rows[0].id, confirmation: confirmation.rows[0] };
  });
}

export async function confirmAction(input: {
  confirmationId: string;
  userId: string;
  phrase: string;
}) {
  const result = await withTransaction(async (client) => {
    const current = await client.query<{
      id: string;
      command_id: string;
      user_id: string;
      summary: string;
      confirmation_phrase: string;
      status: string;
      expires_at: Date;
      confirmed_at: Date | null;
    }>(
      `SELECT id, command_id, user_id, summary, confirmation_phrase, status, expires_at, confirmed_at
       FROM confirmation_requests
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [input.confirmationId, input.userId]
    );
    const confirmation = current.rows[0];
    if (!confirmation) {
      throw new Error("Confirmacao nao encontrada.");
    }

    if (confirmation.status !== "pending") {
      throw new Error(`Confirmacao nao esta pendente: ${confirmation.status}.`);
    }

    if (new Date(confirmation.expires_at).getTime() < Date.now()) {
      await client.query("UPDATE confirmation_requests SET status = 'expired' WHERE id = $1", [confirmation.id]);
      throw new Error("Confirmacao expirada.");
    }

    if (normalizePhrase(input.phrase) !== normalizePhrase(confirmation.confirmation_phrase)) {
      throw new Error(`Frase de confirmacao incorreta. Diga ou digite: ${confirmation.confirmation_phrase}`);
    }

    const updated = await client.query<{
      id: string;
      command_id: string;
      user_id: string;
      status: string;
      expires_at: Date;
      confirmed_at: Date;
    }>(
      `UPDATE confirmation_requests
       SET status = 'confirmed', confirmed_at = NOW()
       WHERE id = $1
       RETURNING id, command_id, user_id, status, expires_at, confirmed_at`,
      [confirmation.id]
    );

    assertConfirmedAction({
      confirmation: {
        id: updated.rows[0].id,
        userId: updated.rows[0].user_id,
        commandId: updated.rows[0].command_id,
        status: updated.rows[0].status,
        expiresAt: updated.rows[0].expires_at,
        confirmedAt: updated.rows[0].confirmed_at
      },
      userId: input.userId,
      commandId: updated.rows[0].command_id
    });

    const token = createRawExecutionToken();
    const tokenHash = hashExecutionToken(token);
    const execution = await client.query<{ id: string; expires_at: Date }>(
      `INSERT INTO execution_tokens(confirmation_id, command_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::INTERVAL)
       RETURNING id, expires_at`,
      [confirmation.id, confirmation.command_id, tokenHash, env.executionTokenTtlMinutes]
    );

    await client.query("UPDATE commands SET status = 'confirmed', updated_at = NOW() WHERE id = $1", [
      confirmation.command_id
    ]);

    const step = await client.query(
      `SELECT id, command_id, tool_name, human_summary, payload_json, status
       FROM command_steps
       WHERE command_id = $1
       ORDER BY step_order ASC
       LIMIT 1`,
      [confirmation.command_id]
    );

    return {
      confirmation: updated.rows[0],
      executionToken: token,
      executionTokenId: execution.rows[0].id,
      executionExpiresAt: execution.rows[0].expires_at,
      step: step.rows[0]
    };
  });

  await auditLog({
    userId: input.userId,
    commandId: result.confirmation.command_id,
    action: "confirmation.confirmed",
    details: { confirmationId: input.confirmationId, executionTokenId: result.executionTokenId }
  });

  return result;
}

export async function rejectAction(input: { confirmationId: string; userId: string; reason?: string }) {
  const result = await query<{ id: string; command_id: string }>(
    `UPDATE confirmation_requests
     SET status = 'rejected', rejected_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING id, command_id`,
    [input.confirmationId, input.userId]
  );

  if (!result.rows[0]) {
    throw new Error("Confirmacao nao encontrada ou nao esta pendente.");
  }

  await query("UPDATE commands SET status = 'rejected', updated_at = NOW() WHERE id = $1", [
    result.rows[0].command_id
  ]);
  await auditLog({
    userId: input.userId,
    commandId: result.rows[0].command_id,
    action: "confirmation.rejected",
    details: { confirmationId: input.confirmationId, reason: input.reason ?? null }
  });

  return result.rows[0];
}

export async function assertExecutionToken(input: {
  client?: pg.PoolClient;
  commandId: string;
  token: string;
}) {
  const tokenHash = hashExecutionToken(input.token);
  type TokenRow = {
    id: string;
    status: string;
    expires_at: Date;
  };
  const result = input.client ? await input.client.query<TokenRow>(
    `SELECT id, status, expires_at
     FROM execution_tokens
     WHERE command_id = $1 AND token_hash = $2
     LIMIT 1`,
    [input.commandId, tokenHash]
  ) : await query<TokenRow>(
    `SELECT id, status, expires_at
     FROM execution_tokens
     WHERE command_id = $1 AND token_hash = $2
     LIMIT 1`,
    [input.commandId, tokenHash]
  );
  const row = result.rows[0];

  if (!row || row.status !== "active" || new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("Token de execucao invalido ou expirado.");
  }

  return row;
}

function normalizePhrase(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
