from __future__ import annotations

import argparse
import queue
import sys
import time

from jarvisbr.clap import ClapSequenceDetector
from jarvisbr.config import settings
from jarvisbr.doctor import run_checks
from jarvisbr.events import Gesture
from jarvisbr.service import JarvisService


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="jarvisbr", description="Jarvis BR local-first")
    sub = parser.add_subparsers(dest="command")

    start = sub.add_parser("start", help="Inicia palmas, voz e HUD")
    start.add_argument("--no-ui", action="store_true", help="Roda sem HUD")

    text = sub.add_parser("text", help="Testa sem microfone")
    text.add_argument("prompt")
    text.add_argument("--agent", action="store_true")

    voice_test = sub.add_parser(
        "voice-test",
        help="Testa microfone -> Whisper -> IA -> voz sem iniciar o serviço",
    )
    voice_test.add_argument("--agent", action="store_true", help="Usa modo agente")

    sub.add_parser(
        "voice-prepare",
        help="Baixa/carrega o modelo Whisper antecipadamente",
    )

    sub.add_parser("doctor", help="Verifica ambiente, microfone e provider")
    sub.add_parser("audio-devices", help="Lista todas as entradas de áudio")

    clap_test = sub.add_parser("clap-test", help="Mostra em tempo real o que o detector de palmas ouve")
    clap_test.add_argument("--seconds", type=float, default=20.0, help="Duração do teste")

    mic_test = sub.add_parser("mic-test", help="Mede o áudio bruto sem classificador")
    mic_test.add_argument("--device", help="Índice ou parte do nome do dispositivo")
    mic_test.add_argument("--seconds", type=float, default=8.0, help="Duração do teste")
    mic_test.add_argument("--save", help="Salva o áudio bruto em WAV para conferência")

    return parser


def _device_label(device, index: int) -> str:
    flags: list[str] = []
    try:
        import sounddevice as sd
        default_input = int(sd.default.device[0])
        if index == default_input:
            flags.append("PADRÃO")
    except Exception:
        pass

    if settings.input_device is not None:
        selected = settings.input_device
        if isinstance(selected, int) and selected == index:
            flags.append("SELECIONADO")
        elif isinstance(selected, str) and selected.lower() in str(device["name"]).lower():
            flags.append("SELECIONADO")

    suffix = f"  <{'/'.join(flags)}>" if flags else ""
    rate = int(float(device.get("default_samplerate", 0) or 0))
    try:
        hostapi = sd.query_hostapis(int(device["hostapi"]))["name"]
    except Exception:
        hostapi = "desconhecido"
    return (
        f"[{index:2}] {device['name']} | entradas={device['max_input_channels']} | "
        f"{rate} Hz | {hostapi}{suffix}"
    )


def _list_audio_devices() -> int:
    import sounddevice as sd

    print("Entradas de áudio disponíveis:")
    found = False
    for index, device in enumerate(sd.query_devices()):
        if int(device["max_input_channels"]) <= 0:
            continue
        found = True
        print(_device_label(device, index))

    if not found:
        print("Nenhuma entrada de áudio encontrada.")
        return 1

    print()
    print("Para fixar uma entrada, coloque no .env, por exemplo:")
    print("JARVIS_INPUT_DEVICE=3")
    print("ou use parte do nome:")
    print("JARVIS_INPUT_DEVICE=Microphone")
    return 0


def _resolve_test_device(raw):
    if raw is None:
        return settings.input_device
    try:
        return int(raw)
    except (TypeError, ValueError):
        return raw


def _mic_test(seconds: float, raw_device=None, save_path=None) -> int:
    import wave

    import numpy as np
    import sounddevice as sd

    device = _resolve_test_device(raw_device)
    try:
        info = sd.query_devices(device, "input")
    except Exception as exc:
        print(f"Não consegui abrir a entrada: {exc}")
        print("Rode: jarvisbr audio-devices")
        return 1

    native_rate = int(float(info.get("default_samplerate", 16000) or 16000))
    blocksize = max(128, int(native_rate * 0.016))
    print(f"Microfone: {info['name']}")
    print(f"Taxa nativa: {native_rate} Hz | bloco: {blocksize} amostras")
    print("Teste BRUTO: fale por 2 s e depois faça 3 palmas.")
    print("Nenhum filtro/classificador é usado aqui.")
    print()

    q = queue.Queue()
    max_peak = 0.0
    max_rms = 0.0
    started_at = time.monotonic()
    captured: list[np.ndarray] = []
    measurements: list[tuple[float, float, float]] = []

    def callback(indata, frames, time_info, status):
        block = np.asarray(indata[:, 0], dtype=np.float32)
        peak = float(np.max(np.abs(block))) if block.size else 0.0
        rms = float(np.sqrt(np.mean(np.square(block)))) if block.size else 0.0
        q.put((time.monotonic(), peak, rms, block.copy()))

    end = time.monotonic() + max(3.0, seconds)
    try:
        with sd.InputStream(
            device=device,
            channels=1,
            samplerate=native_rate,
            blocksize=blocksize,
            dtype="float32",
            callback=callback,
        ):
            while time.monotonic() < end:
                try:
                    ts, peak, rms, block = q.get(timeout=0.2)
                except queue.Empty:
                    continue
                max_peak = max(max_peak, peak)
                max_rms = max(max_rms, rms)
                captured.append(block)
                measurements.append((ts - started_at, peak, rms))
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(f"Falha ao abrir microfone: {exc}")
        return 1

    print()
    print(f"MÁXIMO: peak={max_peak:0.3f} rms={max_rms:0.3f}")

    # Mostra os maiores transientes sem perder palmas por causa de throttling.
    selected: list[tuple[float, float, float]] = []
    for item in sorted(measurements, key=lambda row: row[1], reverse=True):
        if all(abs(item[0] - other[0]) >= 0.08 for other in selected):
            selected.append(item)
        if len(selected) >= 10:
            break
    if selected:
        print("TOP PICOS (separados por pelo menos 80 ms):")
        for offset, peak, rms in sorted(selected):
            bars = min(40, int(peak * 80))
            print(f"  t={offset:0.3f}s peak={peak:0.3f} rms={rms:0.3f} | {'#' * bars}")

    if save_path and captured:
        audio = np.concatenate(captured)
        pcm16 = (np.clip(audio, -1.0, 1.0) * 32767.0).astype(np.int16)
        with wave.open(save_path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(native_rate)
            wf.writeframes(pcm16.tobytes())
        print(f"WAV salvo em: {save_path}")

    return 0


def _clap_test(seconds: float) -> int:
    import numpy as np
    import sounddevice as sd

    detector = ClapSequenceDetector(
        threshold=settings.clap_threshold,
        spike_ratio=settings.clap_spike_ratio,
        max_rms=settings.clap_max_rms,
        min_gap=settings.clap_min_gap,
        max_gap=settings.clap_max_gap,
        settle=settings.clap_settle,
        cooldown=settings.clap_cooldown,
        high_freq_ratio=settings.clap_high_freq_ratio,
        max_event_ms=settings.clap_max_event_ms,
        attack_ratio=settings.clap_attack_ratio,
    )
    device = settings.input_device

    try:
        info = sd.query_devices(device, "input")
    except Exception as exc:
        print(f"Não consegui abrir a entrada configurada: {exc}")
        print("Rode: jarvisbr audio-devices")
        return 1

    native_rate = int(float(info.get("default_samplerate", 16000) or 16000))
    blocksize = max(128, int(native_rate * 0.016))
    print(f"Microfone: {info['name']}")
    print(f"Taxa nativa: {native_rate} Hz | bloco: {blocksize} amostras")
    print(
        "Detector: "
        f"threshold={detector.threshold:.2f} "
        f"crest>={detector.spike_ratio:.2f} "
        f"max_rms={detector.max_rms:.2f} "
        f"ataque>={detector.attack_ratio:.2f} "
        f"release={detector.release_ratio:.2f}"
    )
    print("Faça duas palmas, aguarde 2 segundos, depois faça três palmas.")
    print("Os picos aparecerão abaixo. Ctrl+C encerra.")
    print()

    messages: "queue.Queue[tuple[object | None, Gesture | None, int]]" = queue.Queue()

    def callback(indata, frames, time_info, status) -> None:
        block = np.asarray(indata[:, 0], dtype=np.float32)
        now = time.monotonic()
        before_serial = detector.event_serial
        gesture = detector.feed_block(block, now=now, samplerate=native_rate)
        event = detector.last_event if detector.event_serial != before_serial else None
        if event is not None or gesture is not None:
            messages.put((event, gesture, detector.count))

    end = time.monotonic() + max(3.0, seconds)
    try:
        with sd.InputStream(
            device=device,
            channels=1,
            samplerate=native_rate,
            blocksize=blocksize,
            dtype="float32",
            callback=callback,
        ):
            while time.monotonic() < end:
                try:
                    event, gesture, count = messages.get(timeout=0.1)
                except queue.Empty:
                    continue
                if event is not None:
                    tag = "IMPACTO" if event.accepted else "REJEIT "
                    print(
                        f"{tag} peak={event.peak:.3f} rms={event.rms:.3f} "
                        f"crest={event.crest:.2f} ataque={event.attack_ratio:.1f} "
                        f"seq={count} motivo={event.reason}",
                        flush=True,
                    )
                if gesture == Gesture.DOUBLE_CLAP:
                    print(">>> DETECTADO: 👏👏 MODO CONVERSA", flush=True)
                elif gesture == Gesture.TRIPLE_CLAP:
                    print(">>> DETECTADO: 👏👏👏 MODO AGENTE", flush=True)
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(f"Falha ao abrir microfone: {exc}")
        return 1

    print("Teste encerrado.")
    return 0


def main() -> int:
    args = _parser().parse_args()
    command = args.command or "start"

    if command == "doctor":
        failed = False
        for check in run_checks(settings):
            mark = "OK" if check.ok else "ERRO"
            print(f"[{mark:4}] {check.name}: {check.detail}")
            failed = failed or not check.ok
        return 1 if failed else 0

    if command == "audio-devices":
        return _list_audio_devices()

    if command == "clap-test":
        return _clap_test(args.seconds)

    if command == "mic-test":
        return _mic_test(args.seconds, args.device, args.save)

    if command == "text":
        service = JarvisService(settings)
        print(service.handle_text(args.prompt, agent_mode=args.agent))
        return 0

    if command == "voice-prepare":
        from jarvisbr.stt import WhisperSTT

        stt = WhisperSTT(
            settings.whisper_model,
            settings.language,
            on_status=print,
        )
        stt.prepare()
        print("Reconhecimento de voz preparado.")
        return 0

    if command == "voice-test":
        service = JarvisService(
            settings,
            on_state=lambda state: print(f"[{state.value}]"),
            on_text=print,
        )
        service.interact_once(agent_mode=args.agent)
        return 0

    if command == "start":
        if getattr(args, "no_ui", False):
            service = JarvisService(
                settings,
                on_state=lambda state: print(f"[{state.value}]"),
                on_text=print,
            )
            service.start()
            print(
                "Jarvis BR ativo. CTRL+ALT+J conversa | CTRL+ALT+K agente"
                + (" | palmas ativas" if settings.clap_enabled else "")
            )
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                service.stop()
            return 0

        from jarvisbr.orb import OrbWindow

        holder = {}
        orb = OrbWindow(lambda: holder["service"].stop())
        service = JarvisService(
            settings,
            on_state=orb.set_state,
            on_level=orb.set_level,
            on_text=orb.add_text,
        )
        holder["service"] = service
        service.start()
        orb.run()
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
