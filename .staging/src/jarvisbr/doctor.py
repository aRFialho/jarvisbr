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
    checks=[Check("Python",(3,11)<=sys.version_info[:2]<(3,14),sys.version.split()[0]),Check("Sistema",platform.system()=="Windows",platform.platform())]
    try:
        import sounddevice as sd
        devices=sd.query_devices();inputs=[d for d in devices if int(d.get("max_input_channels",0))>0]
        checks.append(Check("Microfone",bool(inputs),f"{len(inputs)} entrada(s) de áudio"))
    except Exception as exc: checks.append(Check("Microfone",False,str(exc)))
    provider=build_provider(settings);ok,detail=provider.health();checks.append(Check(f"Provider/{provider.name}",ok,detail))
    valid_dirs=[str(p) for p in settings.allowed_dirs if p.exists()]
    checks.append(Check("Pastas permitidas",bool(valid_dirs),", ".join(valid_dirs) or "nenhuma existe"))
    return checks
