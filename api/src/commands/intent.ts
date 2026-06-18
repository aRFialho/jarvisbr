import { normalize } from "../files/search.service.js";

export type DeviceCandidate = {
  id: string;
  friendly_name: string;
  device_type: string;
};

export function interpretCommand(rawText: string, devices: DeviceCandidate[]) {
  const normalized = normalize(rawText);
  const targetDevice = devices
    .map((device) => ({ device, score: deviceMentionScore(normalized, device) }))
    .sort((a, b) => b.score - a.score)[0];

  const hasTargetDevice = Boolean(targetDevice && targetDevice.score > 0);
  const wantsDownload = /\b(baixe|baixar|download|traga|envie)\b/.test(normalized);
  const wantsSearch = /\b(procure|procurar|busque|buscar|ache|encontre|localize)\b/.test(normalized);
  const wantsFile = /\b(arquivo|imagem|foto|logo|documento|pdf|planilha|video|audio)\b/.test(normalized);
  const requestedKind = /\b(imagem|foto|logo|png|jpg|jpeg)\b/.test(normalized) ? "image" : undefined;
  const intent = wantsDownload && wantsFile
    ? "file.download"
    : wantsSearch && wantsFile
      ? "file.search"
      : "conversation";

  return {
    intent,
    targetDeviceId: hasTargetDevice ? targetDevice?.device.id ?? null : null,
    targetDeviceName: hasTargetDevice ? targetDevice?.device.friendly_name ?? null : null,
    query: extractFileQuery(rawText, devices),
    requestedKind,
    needsDeviceSelection: intent !== "conversation" && !hasTargetDevice
  };
}

export function extractFileQuery(rawText: string, devices: DeviceCandidate[] = []) {
  const normalized = normalize(rawText);
  const namedMatch = normalized.match(/(?:chamad[ao]|nome|arquivo|imagem|foto|logo)\s+(?:de\s+)?([a-z0-9 _.-]{2,80})/);
  if (namedMatch?.[1]) {
    return cleanupQuery(namedMatch[1], devices);
  }

  const afterTem = normalized.split(/\btem\b/)[1];
  if (afterTem) {
    return cleanupQuery(afterTem, devices);
  }

  return cleanupQuery(normalized, devices);
}

function cleanupQuery(value: string, devices: DeviceCandidate[]) {
  const withoutDevices = devices
    .map((device) => normalize(device.friendly_name))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .reduce((current, deviceName) => current.replace(new RegExp(`\\b${escapeRegExp(deviceName)}\\b`, "g"), " "), value);

  return withoutDevices
    .replace(/\b(baixe|baixar|download|traga|envie|procure|procurar|busque|buscar|ache|encontre|localize|para mim|pra mim|ela|ele|por favor|no computador|no aparelho|no dispositivo|no pc|notebook|desktop)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deviceMentionScore(raw: string, device: DeviceCandidate) {
  const name = normalize(device.friendly_name);
  const tokens = name.split(/\s+/).filter(Boolean);
  let score = raw.includes(name) ? 1 : 0;
  for (const token of tokens) {
    if (token.length > 2 && raw.includes(token)) {
      score += 0.5;
    }
  }
  if (raw.includes(normalize(device.device_type))) {
    score += 0.2;
  }
  return score;
}
