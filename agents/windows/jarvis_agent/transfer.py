from __future__ import annotations

from pathlib import Path


class TransferAdapter:
    """Adapter seguro: no MVP prepara a transferencia; upload/chunks entram aqui depois."""

    def prepare_file_download(self, path: Path) -> dict:
        if not path.exists() or not path.is_file():
            raise FileNotFoundError(path)
        return {
            "status": "prepared",
            "fileName": path.name,
            "bytesTotal": path.stat().st_size,
            "message": "Arquivo validado localmente. Transferencia real por chunks pode ser conectada aqui.",
        }
