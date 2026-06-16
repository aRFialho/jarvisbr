export type ConfirmationStatus = "pending" | "confirmed" | "rejected" | "expired";

export type ConfirmationRecord = {
  id: string;
  userId: string;
  commandId: string;
  status: ConfirmationStatus | string;
  expiresAt: Date | string;
  confirmedAt?: Date | string | null;
};

export class ConfirmationRequiredError extends Error {
  constructor(message = "Acao bloqueada: confirmacao obrigatoria ausente.") {
    super(message);
    this.name = "ConfirmationRequiredError";
  }
}

export class ConfirmationExpiredError extends Error {
  constructor(message = "Acao bloqueada: confirmacao expirada.") {
    super(message);
    this.name = "ConfirmationExpiredError";
  }
}

export function assertConfirmedAction(input: {
  confirmation?: ConfirmationRecord | null;
  userId: string;
  commandId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const confirmation = input.confirmation;

  if (!confirmation) {
    throw new ConfirmationRequiredError();
  }

  if (confirmation.userId !== input.userId || confirmation.commandId !== input.commandId) {
    throw new ConfirmationRequiredError("Acao bloqueada: confirmacao nao pertence a este usuario/comando.");
  }

  if (new Date(confirmation.expiresAt).getTime() < now.getTime()) {
    throw new ConfirmationExpiredError();
  }

  if (confirmation.status !== "confirmed" || !confirmation.confirmedAt) {
    throw new ConfirmationRequiredError();
  }

  return true;
}

export function confirmationSummaryForFileDownload(input: {
  fileName: string;
  sourceDeviceName: string;
  destinationDeviceName: string;
}) {
  return `Vou baixar "${input.fileName}" do aparelho "${input.sourceDeviceName}" para "${input.destinationDeviceName}". Confirma esta acao?`;
}
