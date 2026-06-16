from __future__ import annotations

import asyncio

from .auth import DeviceApi
from .config import load_config
from .confirmation_guard import ConfirmationGuard
from .file_indexer import FileIndexer
from .tools.file_actions import FileActions
from .transfer import TransferAdapter
from .websocket_client import AgentWebSocketClient


async def main() -> None:
    config = load_config()
    if not config.device_token:
        raise RuntimeError("Configure JARVIS_DEVICE_TOKEN apos parear o aparelho.")

    indexer = FileIndexer(config.data_dir / "files.sqlite3", config.allowed_dirs)
    indexed = indexer.scan_once()
    print(f"Jarvis Agent indexou {indexed} arquivos em pastas autorizadas.")

    api = DeviceApi(config.api_url, config.device_token)
    guard = ConfirmationGuard(api)
    file_actions = FileActions(indexer, TransferAdapter())
    client = AgentWebSocketClient(config.ws_url, indexer, guard, file_actions, api)
    await client.run_forever()


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
