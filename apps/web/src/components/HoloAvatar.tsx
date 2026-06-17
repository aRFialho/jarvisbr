import type { CSSProperties } from "react";
import { Keyboard, Mic } from "lucide-react";
import type { HoloState } from "../lib/api";

type HoloAvatarProps = {
  state: HoloState;
  assistantName: string;
  transcript: string;
  audioLevel?: number;
  onVoiceMode?: () => void;
  onTextMode?: () => void;
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

export function HoloAvatar({ state, assistantName, transcript, audioLevel = 0.42, onVoiceMode, onTextMode }: HoloAvatarProps) {
  const isSpeaking = state === "executing";

  return (
    <section className={`holo holo-${state} ${isSpeaking ? "holo-speaking" : ""}`} aria-label={`Estado do ${assistantName}: ${stateLabels[state]}`}>
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
        <svg className="holo-portrait" viewBox="0 0 420 520" role="img" aria-label={`Holograma humano do ${assistantName}`}>
          <defs>
            <radialGradient id="skinGlow" cx="50%" cy="35%" r="58%">
              <stop offset="0%" stopColor="#7df8ff" stopOpacity="0.48" />
              <stop offset="42%" stopColor="#25f4ff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#061827" stopOpacity="0.02" />
            </radialGradient>
            <linearGradient id="portraitStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#bdfaff" stopOpacity="0.96" />
              <stop offset="45%" stopColor="#25f4ff" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#0e6cff" stopOpacity="0.45" />
            </linearGradient>
            <filter id="blueGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id="headClip">
              <path d="M210 42C135 42 92 97 92 181c0 91 42 150 76 176 18 14 29 20 42 20s24-6 42-20c34-26 76-85 76-176C328 97 285 42 210 42Z" />
            </clipPath>
          </defs>

          <g className="shoulder-system">
            <path className="body-fill" d="M42 505c18-87 77-124 132-139 20 23 48 38 36 38s16-15 36-38c55 15 114 52 132 139H42Z" />
            <path className="body-line" d="M42 505c18-87 77-124 132-139 20 23 48 38 36 38s16-15 36-38c55 15 114 52 132 139" />
            <path className="collar-line" d="M112 445c46 22 151 22 196 0" />
            <path className="chest-line" d="M84 486c78-18 174-18 252 0" />
          </g>

          <path className="neck-fill" d="M170 342c6 48-5 64-33 83 42 26 104 26 146 0-28-19-39-35-33-83H170Z" />
          <path className="neck-line" d="M170 342c6 48-5 64-33 83M250 342c-6 48 5 64 33 83" />

          <g className="head-system">
            <path className="ear ear-left" d="M96 176c-20-2-31 18-25 47 6 30 20 47 36 43" />
            <path className="ear ear-right" d="M324 176c20-2 31 18 25 47-6 30-20 47-36 43" />
            <path className="head-fill" d="M210 42C135 42 92 97 92 181c0 91 42 150 76 176 18 14 29 20 42 20s24-6 42-20c34-26 76-85 76-176C328 97 285 42 210 42Z" />
            <path className="head-outline" d="M210 42C135 42 92 97 92 181c0 91 42 150 76 176 18 14 29 20 42 20s24-6 42-20c34-26 76-85 76-176C328 97 285 42 210 42Z" />

            <g clipPath="url(#headClip)">
              {Array.from({ length: 94 }, (_, index) => (
                <circle
                  className="face-pixel"
                  key={index}
                  cx={102 + ((index * 37) % 216)}
                  cy={58 + ((index * 53) % 300)}
                  r={index % 7 === 0 ? 1.9 : 1.1}
                  style={{ "--i": index } as CSSProperties}
                />
              ))}
              <path className="face-meridian" d="M210 40v337" />
              <path className="face-latitude" d="M114 171c52 12 141 12 193 0" />
              <path className="face-latitude soft" d="M118 222c50 18 134 18 184 0" />
            </g>

            <path className="brow brow-left" d="M134 178c20-15 48-17 70-4" />
            <path className="brow brow-right" d="M216 174c22-13 50-11 70 4" />
            <g className="eyes">
              <g className="eye-unit portrait-eye-left">
                <ellipse className="eye-aura" cx="164" cy="206" rx="38" ry="20" />
                <ellipse className="eye-glow" cx="164" cy="206" rx="21" ry="9" />
                <path className="eye-lid" d="M128 205c20-18 51-18 72 0" />
              </g>
              <g className="eye-unit portrait-eye-right">
                <ellipse className="eye-aura" cx="256" cy="206" rx="38" ry="20" />
                <ellipse className="eye-glow" cx="256" cy="206" rx="21" ry="9" />
                <path className="eye-lid" d="M220 205c20-18 51-18 72 0" />
              </g>
            </g>

            <path className="nose-bridge" d="M210 198c-7 30-13 55-22 75 10 11 34 11 44 0-9-20-15-45-22-75Z" />
            <path className="nose-detail" d="M190 282c11 9 29 9 40 0" />

            <g className="mouth">
              <path className="mouth-lip upper" d="M168 314c15-13 28-17 42-7 14-10 27-6 42 7-22 12-62 12-84 0Z" />
              <path className="mouth-lip lower" d="M170 323c22 22 58 22 80 0" />
              <ellipse className="mouth-open" cx="210" cy="319" rx="24" ry="5" />
              <path className="mouth-scan" d="M177 319h66" />
            </g>
          </g>

          <text className="chest-name" x="210" y="456" textAnchor="middle">{assistantName}</text>
        </svg>
        <div className="holo-face-effects">
          <span className="scan-line" />
          <span className="voice-wave" />
        </div>
        <div className="hud-readout readout-left">VOICE</div>
        <div className="hud-readout readout-right">SYNC</div>
      </div>
      <div className="holo-caption">
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
