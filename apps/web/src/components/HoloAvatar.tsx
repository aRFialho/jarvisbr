import { JarvisHologram, type JarvisHologramState } from "./JarvisHologram";
import type { HoloState } from "../lib/api";

type HoloAvatarProps = {
  state: HoloState;
  assistantName: string;
  transcript: string;
  audioLevel?: number;
  onVoiceMode?: () => void;
  onTextMode?: () => void;
};

const visualStateMap: Record<HoloState, JarvisHologramState> = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  searching: "thinking",
  confirming: "thinking",
  executing: "speaking",
  done: "success",
  error: "error"
};

export function HoloAvatar({ state, assistantName, transcript, audioLevel, onVoiceMode, onTextMode }: HoloAvatarProps) {
  return (
    <JarvisHologram
      state={visualStateMap[state]}
      assistantName={assistantName}
      transcript={transcript}
      audioLevel={audioLevel}
      onVoiceMode={onVoiceMode}
      onTextMode={onTextMode}
    />
  );
}
