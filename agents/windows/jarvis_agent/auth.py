from __future__ import annotations

import requests


class DeviceApi:
    def __init__(self, api_url: str, device_token: str) -> None:
        self.api_url = api_url.rstrip("/")
        self.device_token = device_token

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.device_token}", "Content-Type": "application/json"}

    def verify_execution(self, command_id: str, execution_token: str) -> dict:
        response = requests.post(
            f"{self.api_url}/agent/execution/verify",
            headers=self.headers,
            json={"commandId": command_id, "executionToken": execution_token},
            timeout=8,
        )
        response.raise_for_status()
        return response.json()

    def complete_execution(self, command_id: str, execution_token: str, status: str, message: str = "") -> None:
        response = requests.post(
            f"{self.api_url}/agent/execution/complete",
            headers=self.headers,
            json={"commandId": command_id, "executionToken": execution_token, "status": status, "message": message},
            timeout=8,
        )
        response.raise_for_status()
