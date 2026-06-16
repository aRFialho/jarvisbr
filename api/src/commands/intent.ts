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

  const wantsDownload = /\b(baixe|baixar|download|traga|envie)\b/.test(normalized);
  const wantsFile = /\b(arquivo|imagem|foto|logo|documento)\b/.test(normalized);
  const requestedKind = /\b(imagem|foto|logo|png|jpg|jpeg)\b/.test(normalized) ? "image" : undefined;

  return {
    intent: wantsDownload && wantsFile ? "file.download" : "conversation",
    targetDeviceId: targetDevice?.score > 0 ? targetDevice.device.id : null,
    targetDeviceName: targetDevice?.score > 0 ? targetDevice.device.friendly_name : null,
    query: extractFileQuery(rawText),
    requestedKind,
    needsDeviceSelection: !targetDevice || targetDevice.score === 0
  };
}

export function extractFileQuery(rawText: string) {
  const normalized = normalize(rawText);
  const namedMatch = normalized.match(/(?:chamad[ao]|nome|arquivo|imagem|foto|logo)\s+(?:de\s+)?([a-z0-9 _.-]{2,80})/);
  if (namedMatch?.[1]) {
    return cleanupQuery(namedMatch[1]);
  }

  const afterTem = normalized.split(/\btem\b/)[1];
  if (afterTem) {
    return cleanupQuery(afterTem);
  }

  return cleanupQuery(normalized);
}

function cleanupQuery(value: string) {
  return value
    .replace(/\b(baixe|baixar|download|para mim|pra mim|ela|ele|por favor|no computador|no pc|notebook|desktop)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
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
