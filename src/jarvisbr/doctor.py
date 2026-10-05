from __future__ import annotations

import platform
import sys
from dataclasses import dataclass

from jarvisbr.config import Settings
from jarvisbr.factory import build_provider


@dataclass(slots=True)
class Check:
    name: str
    ok: bool
    detail: str


def run_checks(settings: Settings) -> list[Check]:
    checks = [
        Check(
            "Python",
            (3, 11) <= sys.version_info[:2] < (3, 14),
            sys.version.split()[0],
        ),
        Check("Sistema", platform.system() == "Windows", platform.platform()),
    ]

    try:
        import sounddevice as sd

        devices = sd.query_devices()
        inputs = [
            (index, device)
            for index, device in enumerate(devices)
            if int(device.get("max_input_channels", 0)) > 0
        ]
        checks.append(Check("Microfone", bool(inputs), f"{len(inputs)} entrada(s) de áudio"))

        default_index = int(sd.default.device[0])
        default_name = (
            devices[default_index]["name"]
            if 0 <= default_index < len(devices)
            else "não definido"
        )
        checks.append(
            Check(
                "Microfone padrão",
                default_index >= 0,
                f"[{default_index}] {default_name}",
            )
        )

        try:
            selected = sd.query_devices(settings.input_device, "input")
            source = (
                "padrão do Windows"
                if settings.input_device is None
                else f"JARVIS_INPUT_DEVICE={settings.input_device}"
            )
            checks.append(
                Check(
                    "Microfone do Jarvis",
                    True,
                    f"{selected['name']} ({source})",
                )
            )
        except Exception as exc:
            checks.append(Check("Microfone do Jarvis", False, str(exc)))
    except Exception as exc:
        checks.append(Check("Microfone", False, str(exc)))

    provider = build_provider(settings)
    ok, detail = provider.health()
    checks.append(Check(f"Provider/{provider.name}", ok, detail))

    valid_dirs = [str(path) for path in settings.allowed_dirs if path.exists()]
    checks.append(
        Check(
            "Pastas permitidas",
            bool(valid_dirs),
            ", ".join(valid_dirs) or "nenhuma existe",
        )
    )
    return checks
