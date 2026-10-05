from __future__ import annotations

import argparse
import sys
import time
from jarvisbr.config import settings
from jarvisbr.doctor import run_checks
from jarvisbr.service import JarvisService


def _parser()->argparse.ArgumentParser:
    parser=argparse.ArgumentParser(prog="jarvisbr",description="Jarvis BR local-first");sub=parser.add_subparsers(dest="command");start=sub.add_parser("start",help="Inicia palmas, voz e HUD");start.add_argument("--no-ui",action="store_true",help="Roda sem HUD");text=sub.add_parser("text",help="Testa sem microfone");text.add_argument("prompt");text.add_argument("--agent",action="store_true");sub.add_parser("doctor",help="Verifica ambiente, microfone e provider");return parser

def main()->int:
    args=_parser().parse_args();command=args.command or "start"
    if command=="doctor":
        failed=False
        for check in run_checks(settings):
            mark="OK" if check.ok else "ERRO";print(f"[{mark:4}] {check.name}: {check.detail}");failed=failed or not check.ok
        return 1 if failed else 0
    if command=="text":
        service=JarvisService(settings);print(service.handle_text(args.prompt,agent_mode=args.agent));return 0
    if command=="start":
        if getattr(args,"no_ui",False):
            service=JarvisService(settings,on_state=lambda s:print(f"[{s.value}]"),on_text=print);service.start();print("Jarvis BR ativo. 👏👏 conversa | 👏👏👏 agente | CTRL+ALT+J conversa")
            try:
                while True:time.sleep(1)
            except KeyboardInterrupt:service.stop()
            return 0
        from jarvisbr.orb import OrbWindow
        holder={};orb=OrbWindow(lambda:holder["service"].stop());service=JarvisService(settings,on_state=orb.set_state,on_level=orb.set_level,on_text=orb.add_text);holder["service"]=service;service.start();orb.run();return 0
    return 2

if __name__=="__main__":sys.exit(main())
