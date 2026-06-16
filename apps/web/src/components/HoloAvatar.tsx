import type { HoloState } from "../lib/api";

type HoloAvatarProps = {
  state: HoloState;
  assistantName: string;
  transcript: string;
  audioLevel?: number;
};

const stateLabels: Record<HoloState, string> = {
  idle: "Pronto",
  listening: "Ouvindo",
  thinking: "Pensando",
  searching: "Buscando",
  confirming: "Confirmando",
  executing: "Executando",
  done: "Concluido",
  error: "Bloqueado"
};

export function HoloAvatar({ state, assistantName, transcript, audioLevel = 0.42 }: HoloAvatarProps) {
  return (
    <section className={`holo holo-${state}`} aria-label={`Estado do ${assistantName}: ${stateLabels[state]}`}>
      <div className="holo-grid" />
      <div className="holo-core" style={{ "--audio": audioLevel } as React.CSSProperties}>
        <div className="holo-ring ring-one" />
        <div className="holo-ring ring-two" />
        <div className="holo-ring ring-three" />
        <div className="holo-face">
          <span className="scan-line" />
          <span className="eye eye-left" />
          <span className="eye eye-right" />
          <span className="voice-wave" />
        </div>
      </div>
      <div className="holo-caption">
        <span className="state-chip">{stateLabels[state]}</span>
        <h1>{assistantName}</h1>
        <p>{transcript}</p>
      </div>
    </section>
  );
}
