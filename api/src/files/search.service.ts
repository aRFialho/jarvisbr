import { query as dbQuery } from "../db/pool.js";
import type { FileSearchResult } from "../types.js";

type CachedFile = {
  device_id: string;
  local_file_id: string;
  file_name: string;
  file_kind: string | null;
  file_size: string | number | null;
  file_path_hint: string | null;
  modified_at: Date | null;
  thumbnail_token: string | null;
};

export async function searchCachedFiles(input: {
  userId: string;
  deviceId: string;
  query: string;
  requestedKind?: string;
  limit?: number;
}) {
  const cached = await dbQuery<CachedFile>(
    `SELECT device_id, local_file_id, file_name, file_kind, file_size, file_path_hint, modified_at, thumbnail_token
     FROM file_index_cache
     WHERE user_id = $1 AND device_id = $2
     ORDER BY last_seen_at DESC
     LIMIT 250`,
    [input.userId, input.deviceId]
  );

  return cached.rows
    .map((row) => ({
      localFileId: row.local_file_id,
      fileName: row.file_name,
      fileKind: row.file_kind ?? inferKind(row.file_name),
      fileSize: Number(row.file_size ?? 0),
      filePathHint: row.file_path_hint ?? "Pasta autorizada",
      modifiedAt: (row.modified_at ?? new Date()).toISOString(),
      thumbnailToken: row.thumbnail_token ?? `cached:${row.local_file_id}`,
      score: scoreFile(input.query, row.file_name, row.file_kind ?? inferKind(row.file_name), input.requestedKind),
      deviceId: row.device_id
    }))
    .filter((item) => item.score > 0.18)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 10);
}

export function mockFileSearchResults(input: {
  deviceId: string;
  query: string;
  requestedKind?: string;
}): FileSearchResult[] {
  const now = new Date();
  const q = normalize(input.query);
  const imageKind = input.requestedKind === "image" || q.includes("logo") || q.includes("azul");

  const samples = imageKind
    ? [
        ["mock-logo-blue-final", "logo_azul_final.png", "Desktop/Clientes", 2100000, 0],
        ["mock-logo-blue-transparent", "logo azul transparente.png", "Downloads", 1700000, 1],
        ["mock-logomarca-blue-site", "logomarca azul site.jpg", "Imagens/Site", 800000, 4],
        ["mock-logo-blue-old", "logo-azul-antigo.webp", "Arquivos/Marca", 420000, 12]
      ]
    : [
        ["mock-doc-briefing", `${input.query || "arquivo"} briefing.pdf`, "Documentos", 380000, 2],
        ["mock-doc-final", `${input.query || "arquivo"} final.docx`, "Downloads", 620000, 5]
      ];

  return samples.map(([id, fileName, folder, size, daysAgo]) => ({
    localFileId: String(id),
    fileName: String(fileName),
    fileKind: inferKind(String(fileName)),
    fileSize: Number(size),
    filePathHint: String(folder),
    modifiedAt: new Date(now.getTime() - Number(daysAgo) * 86400000).toISOString(),
    thumbnailToken: `mock-thumb:${id}`,
    score: scoreFile(input.query, String(fileName), inferKind(String(fileName)), input.requestedKind),
    deviceId: input.deviceId,
    mock: true
  }));
}

export function scoreFile(query: string, fileName: string, fileKind: string, requestedKind?: string) {
  const q = normalize(query);
  const name = normalize(fileName);
  const qTokens = new Set(q.split(/\s+/).filter(Boolean));
  const nameTokens = new Set(name.replace(/[._-]/g, " ").split(/\s+/).filter(Boolean));
  const overlap = [...qTokens].filter((token) => nameTokens.has(token)).length / Math.max(qTokens.size, 1);
  const subsequence = name.includes(q) ? 1 : similarityRatio(q, name);
  const kindBoost = requestedKind && requestedKind === fileKind ? 1 : 0;

  return round2(0.55 * subsequence + 0.3 * overlap + 0.15 * kindBoost);
}

export function inferKind(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return "unknown";
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext)) return "image";
  if (["pdf", "doc", "docx", "txt", "md", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "document";
  if (["mp4", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "flac"].includes(ext)) return "audio";
  return "other";
}

export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s._-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityRatio(a: string, b: string) {
  if (!a || !b) return 0;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[a.length][b.length];
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
