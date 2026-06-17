import type { CSSProperties } from "react";
import { AlertTriangle, Check, Keyboard, Mic } from "lucide-react";
import jarvisHologramSrc from "../../../../docs/Jarvis.png";

export type JarvisHologramState = "idle" | "listening" | "speaking" | "thinking" | "success" | "error";

type JarvisHologramProps = {
  state?: JarvisHologramState;
  assistantName?: string;
  transcript?: string;
  audioLevel?: number;
  className?: string;
  onVoiceMode?: () => void;
  onTextMode?: () => void;
};

const stateLabels: Record<JarvisHologramState, string> = {
  idle: "Pronto",
  listening: "Ouvindo...",
  speaking: "Falando...",
  thinking: "Processando...",
  success: "Sincronizado",
  error: "Alerta"
};

export function JarvisHologram({
  state = "idle",
  assistantName = "Jarvis",
  transcript = "Ola, em que posso ajudar?",
  audioLevel = 0.42,
  className = "",
  onVoiceMode,
  onTextMode
}: JarvisHologramProps) {
  return (
    <section
      className={`holo jarvis-hologram jarvis-hologram--${state} ${className}`.trim()}
      style={{ "--audio": audioLevel } as CSSProperties}
      aria-label={`Estado do ${assistantName}: ${stateLabels[state]}`}
      aria-live="polite"
    >
      <div className="holo-frame-top" />
      <div className="holo-grid" />
      <div className="jarvis-hologram__backlight" aria-hidden="true" />
      <div className="jarvis-hologram__particles" aria-hidden="true">
        {Array.from({ length: 48 }, (_, index) => (
          <span
            key={index}
            style={{
              "--i": index,
              "--x": `${(index * 37 + 11) % 100}%`,
              "--y": `${(index * 23 + 17) % 100}%`,
              "--size": `${2 + (index % 4)}px`,
              "--duration": `${5600 + index * 80}ms`,
              "--fast-duration": `${3200 + index * 40}ms`,
              "--delay": `${index * -120}ms`
            } as CSSProperties}
          />
        ))}
      </div>
      <div className="jarvis-hologram__data-web" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <span
            key={index}
            style={{
              "--i": index,
              "--x": `${(index * 29 + 6) % 92}%`,
              "--y": `${(index * 17 + 18) % 76}%`,
              "--line": `${42 + (index % 4) * 20}px`,
              "--angle": `${-24 + (index % 6) * 10}deg`,
              "--delay": `${index * -130}ms`
            } as CSSProperties}
          />
        ))}
      </div>

      <div className="jarvis-hologram__core">
        <div className="jarvis-hologram__hud jarvis-hologram__hud--outer" aria-hidden="true" />
        <div className="jarvis-hologram__hud jarvis-hologram__hud--middle" aria-hidden="true" />
        <div className="jarvis-hologram__hud jarvis-hologram__hud--inner" aria-hidden="true" />
        <div className="jarvis-hologram__loading-ring" aria-hidden="true" />
        <div className="jarvis-hologram__sound-waves" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className="jarvis-hologram__image-shell">
          <img className="jarvis-hologram__image" src={jarvisHologramSrc} alt={`Holograma ${assistantName}`} draggable={false} />
          <span className="jarvis-hologram__scanline" aria-hidden="true" />
          <span className="jarvis-hologram__digital-noise" aria-hidden="true" />
        </div>

        <span className="jarvis-hologram__eye jarvis-hologram__eye--left" aria-hidden="true" />
        <span className="jarvis-hologram__eye jarvis-hologram__eye--right" aria-hidden="true" />
        <span className="jarvis-hologram__mouth" aria-hidden="true" />
        <span className="jarvis-hologram__base-pulse" aria-hidden="true" />
        <span className="jarvis-hologram__nameplate" aria-hidden="true">{assistantName}</span>

        <div className="jarvis-hologram__success" aria-hidden="true">
          <Check size={46} />
        </div>
        <div className="jarvis-hologram__alert" aria-hidden="true">
          <AlertTriangle size={34} />
        </div>
      </div>

      <div className="jarvis-hologram__status">
        <span className="jarvis-hologram__status-dot" />
        {stateLabels[state]}
      </div>

      <div className="holo-caption jarvis-hologram__caption">
        <p>{transcript}</p>
        <div className="holo-actions">
          <button type="button" onClick={onVoiceMode} disabled={!onVoiceMode}>
            <Mic size={18} /> Voz
          </button>
          <button type="button" onClick={onTextMode} disabled={!onTextMode}>
            <Keyboard size={18} /> Texto
          </button>
        </div>
      </div>
    </section>
  );
}
