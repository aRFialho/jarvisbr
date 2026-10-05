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

    sub.add_parser("doctor", help="Verifica ambiente, microfone e provider")
    sub.add_parser("audio-devices", help="Lista todas as entradas de áudio")

    clap_test = sub.add_parser("clap-test", help="Mostra em tempo real o que o detector de palmas ouve")
    clap_test.add_argument("--seconds", type=float, default=20.0, help="Duração do teste")

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
    return f"[{index:2}] {device['name']} | entradas={device['max_input_channels']}{suffix}"


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
    )
    device = settings.input_device

    try:
        info = sd.query_devices(device, "input")
    except Exception as exc:
        print(f"Não consegui abrir a entrada configurada: {exc}")
        print("Rode: jarvisbr audio-devices")
        return 1

    print(f"Microfone: {info['name']}")
    print(
        "Detector: "
        f"threshold={detector.threshold:.2f} "
        f"crest>={detector.spike_ratio:.2f} "
        f"max_rms={detector.max_rms:.2f}"
    )
    print("Faça duas palmas, aguarde 2 segundos, depois faça três palmas.")
    print("Os picos aparecerão abaixo. Ctrl+C encerra.")
    print()

    messages: "queue.Queue[tuple[float, float, float, bool, Gesture | None, int]]" = queue.Queue()
    last_report = 0.0

    def callback(indata, frames, time_info, status) -> None:
        nonlocal last_report
        block = np.asarray(indata[:, 0], dtype=np.float32)
        metrics = detector.metrics(block)
        now = time.monotonic()
        candidate = detector.is_clap(metrics.peak, metrics.rms)
        gesture = detector.feed_metrics(metrics.peak, metrics.rms, now)

        should_report = candidate or gesture is not None
        if metrics.peak >= 0.04 and now - last_report >= 0.18:
            should_report = True

        if should_report:
            last_report = now
            messages.put(
                (
                    metrics.peak,
                    metrics.rms,
                    metrics.crest,
                    candidate,
                    gesture,
                    detector.count,
                )
            )

    end = time.monotonic() + max(3.0, seconds)
    try:
        with sd.InputStream(
            device=device,
            channels=1,
            samplerate=16000,
            blocksize=256,
            dtype="float32",
            callback=callback,
        ):
            while time.monotonic() < end:
                try:
                    peak, rms, crest, candidate, gesture, count = messages.get(timeout=0.1)
                except queue.Empty:
                    continue
                tag = "CLAP" if candidate else "som "
                print(
                    f"{tag} peak={peak:.3f} rms={rms:.3f} crest={crest:.2f} sequência={count}",
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

    if command == "text":
        service = JarvisService(settings)
        print(service.handle_text(args.prompt, agent_mode=args.agent))
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
                "Jarvis BR ativo. 👏👏 conversa | 👏👏👏 agente | CTRL+ALT+J conversa"
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
