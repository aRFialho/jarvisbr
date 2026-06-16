import type { CSSProperties } from "react";
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
      <div className="holo-frame-top" />
      <div className="holo-grid" />
      <div className="holo-particles">
        {Array.from({ length: 30 }, (_, index) => <span key={index} style={{ "--i": index } as CSSProperties} />)}
      </div>
      <div className="holo-core" style={{ "--audio": audioLevel } as CSSProperties}>
        <div className="holo-ring ring-one" />
        <div className="holo-ring ring-two" />
        <div className="holo-ring ring-three" />
        <div className="holo-ring ring-four" />
        <div className="holo-silhouette">
          <div className="holo-head">
            <span className="face-grid" />
            <span className="eye eye-left" />
            <span className="eye eye-right" />
            <span className="mouth-wave" />
          </div>
          <div className="holo-neck" />
          <div className="holo-shoulders" />
        </div>
        <div className="holo-face-effects">
          <span className="scan-line" />
          <span className="voice-wave" />
        </div>
        <div className="hud-readout readout-left">VOICE</div>
        <div className="hud-readout readout-right">SYNC</div>
      </div>
      <div className="holo-caption">
        <span className="state-chip">{stateLabels[state]}</span>
        <h1>{assistantName}</h1>
        <p>{transcript}</p>
      </div>
    </section>
  );
}
