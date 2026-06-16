import { ShieldCheck, X } from "lucide-react";
import type { Confirmation } from "../lib/api";

type Props = {
  confirmation: Confirmation;
  phrase: string;
  onPhraseChange: (phrase: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmationModal({ confirmation, phrase, onPhraseChange, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="confirm-modal">
        <button className="icon-button close-button" type="button" onClick={onCancel} aria-label="Cancelar">
          <X size={18} />
        </button>
        <div className="confirm-symbol">
          <ShieldCheck size={30} />
        </div>
        <h2 id="confirm-title">Confirmacao obrigatoria</h2>
        <p className="confirm-summary">{confirmation.summary}</p>
        <label>
          Digite ou fale <strong>{confirmation.confirmation_phrase}</strong>
          <input value={phrase} onChange={(event) => onPhraseChange(event.target.value)} autoFocus />
        </label>
        <div className="confirm-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>Cancelar</button>
          <button className="primary-button warn" type="button" onClick={onConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}
