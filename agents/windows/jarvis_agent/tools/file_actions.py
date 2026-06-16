from __future__ import annotations

from ..file_indexer import FileIndexer
from ..transfer import TransferAdapter


class FileActions:
    def __init__(self, indexer: FileIndexer, transfer: TransferAdapter) -> None:
        self.indexer = indexer
        self.transfer = transfer

    def download(self, payload: dict) -> dict:
        local_file_id = payload.get("localFileId")
        if not local_file_id:
            raise ValueError("localFileId ausente.")
        path = self.indexer.path_for(local_file_id)
        return self.transfer.prepare_file_download(path)
