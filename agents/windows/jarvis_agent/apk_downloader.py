from __future__ import annotations

from pathlib import Path

import requests


class ApkDownloadResult:
    def __init__(self, downloaded: bool, path: Path | None, message: str) -> None:
        self.downloaded = downloaded
        self.path = path
        self.message = message


def download_android_apk(api_url: str, target_dir: Path) -> ApkDownloadResult:
    manifest_url = f"{api_url.rstrip('/')}/install/public-manifest"
    response = requests.get(manifest_url, timeout=10)
    response.raise_for_status()
    apk_url = response.json().get("androidApkUrl")

    if not apk_url:
        return ApkDownloadResult(
            False,
            None,
            "APK Android ainda nao configurado no backend. Defina ANDROID_APK_URL no Render quando o APK estiver publicado.",
        )

    target_dir.mkdir(parents=True, exist_ok=True)
    output = target_dir / "jarvisbr-android.apk"
    with requests.get(apk_url, stream=True, timeout=60) as apk_response:
        apk_response.raise_for_status()
        with output.open("wb") as file:
            for chunk in apk_response.iter_content(chunk_size=1024 * 512):
                if chunk:
                    file.write(chunk)

    return ApkDownloadResult(True, output, f"APK Android baixado em: {output}")
