export type HoloState = "idle" | "listening" | "thinking" | "searching" | "confirming" | "executing" | "done" | "error";

const fallbackApiUrl = "https://jarvis-api-n9wv.onrender.com";

function resolveApiUrl(...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized && /^https?:\/\//i.test(normalized)) {
      return normalized.replace(/\/+$/, "");
    }
  }

  return fallbackApiUrl;
}

export const jarvisApiUrl = resolveApiUrl(import.meta.env.VITE_API_URL, import.meta.env.NEXT_PUBLIC_API_URL);

export type Device = {
  id: string;
  friendly_name: string;
  device_type: string;
  platform: string;
  status: string;
};

export type FileResult = {
  localFileId: string;
  fileName: string;
  fileKind: string;
  fileSize: number;
  filePathHint: string;
  modifiedAt: string;
  thumbnailToken: string;
  score: number;
  deviceId: string;
  mock?: boolean;
};

export type Settings = {
  assistant_name: string;
  wake_phrases: string[];
  response_tone: string;
  require_confirmation_for_all_actions: boolean;
  floating_button_enabled: boolean;
  always_listening_enabled: boolean;
  humor_level: number;
  slang_level: number;
  answer_length: string;
  assistant_avatar_url?: string;
  agent_avatar_url?: string;
  agent_install_mode: string;
};

export type ServiceHealth = {
  api: string;
  database: string;
  devices: Record<string, number>;
  confirmations: Record<string, number>;
  commands: Record<string, number>;
  checkedAt: string;
};

export type PairingCode = {
  pairingId: string;
  code: string;
  expiresAt: string;
};

export type Confirmation = {
  id: string;
  command_id: string;
  summary: string;
  confirmation_phrase: string;
  status: string;
  expires_at: string;
};

export type InterpretedCommand = {
  intent: "conversation" | "file.search" | "file.download" | "app.prepare" | "browser.prepare";
  targetDeviceId: string | null;
  targetDeviceName: string | null;
  query: string;
  requestedKind?: string;
  needsDeviceSelection: boolean;
};

const emptySettings: Settings = {
  assistant_name: "Jarvis",
  wake_phrases: ["Jarvis"],
  response_tone: "futurista_direto",
  require_confirmation_for_all_actions: true,
  floating_button_enabled: true,
  always_listening_enabled: false,
  humor_level: 0.4,
  slang_level: 0.2,
  answer_length: "curta_objetiva",
  assistant_avatar_url: "",
  agent_avatar_url: "",
  agent_install_mode: "manual"
};

function hasId(value: unknown): value is { id: string } {
  return Boolean(value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string");
}

function ensureIdentified<T extends object>(value: T | undefined, label: string): T & { id: string } {
  if (hasId(value)) {
    return value as T & { id: string };
  }

  throw new Error(`${label} retornou sem identificador. Atualize a tela e tente novamente.`);
}

export class JarvisApi {
  token = localStorage.getItem("jarvis_token") ?? "";

  get authenticated() {
    return Boolean(this.token);
  }

  async register(name: string, email: string, password: string) {
    const data = await this.request<{ token: string }>("/auth/register", { method: "POST", body: { name, email, password } }, false);
    this.setToken(data.token);
    return data;
  }

  async login(email: string, password: string) {
    const data = await this.request<{ token: string }>("/auth/login", { method: "POST", body: { email, password } }, false);
    this.setToken(data.token);
    return data;
  }

  logout() {
    this.setToken("");
  }

  async devices() {
    const data = await this.request<{ devices?: Device[] }>("/devices");
    return {
      devices: Array.isArray(data.devices)
        ? data.devices.filter((device): device is Device => hasId(device))
        : []
    };
  }

  async settings() {
    const data = await this.request<{ settings?: Settings; voices?: unknown[] }>("/me/settings");
    return {
      settings: data.settings ?? emptySettings,
      voices: Array.isArray(data.voices) ? data.voices : []
    };
  }

  async updateSettings(settings: Partial<{
    assistantName: string;
    wakePhrases: string[];
    responseTone: string;
    humorLevel: number;
    slangLevel: number;
    answerLength: string;
    assistantAvatarUrl: string;
    agentAvatarUrl: string;
    floatingButtonEnabled: boolean;
    alwaysListeningEnabled: boolean;
  }>) {
    return this.request<{ settings: Settings }>("/me/settings", { method: "PATCH", body: settings });
  }

  async serviceHealth() {
    return this.request<ServiceHealth>("/service/health");
  }

  async installManifest() {
    return this.request<{ artifacts: unknown[]; androidApkUrl: string | null; windowsAgentUrl: string | null }>("/install/manifest");
  }

  async createPairingCode(requestedDeviceName: string) {
    const pairing = await this.request<PairingCode>("/devices/pairing-code", {
      method: "POST",
      body: { requestedDeviceName }
    });

    if (!pairing.pairingId || !pairing.code) {
      throw new Error("Codigo de vinculacao retornou incompleto. Atualize a tela e tente novamente.");
    }

    return pairing;
  }

  async pairMockCasa() {
    const pairing = await this.request<{ code: string }>("/devices/pairing-code", {
      method: "POST",
      body: { requestedDeviceName: "Casa" }
    });
    return this.request("/devices/claim", {
      method: "POST",
      body: {
        code: pairing.code,
        friendlyName: "Casa",
        deviceType: "desktop",
        platform: "Windows",
        publicKey: "mock-public-key-owned-device"
      }
    }, false);
  }

  async createCommand(rawText: string) {
    const data = await this.request<{ command?: { id: string }; interpreted?: InterpretedCommand; reply?: string }>("/commands", {
      method: "POST",
      body: { rawText }
    });

    const command = ensureIdentified(data.command, "Comando");
    return {
      command,
      interpreted: data.interpreted ?? {
        intent: "conversation",
        targetDeviceId: null,
        targetDeviceName: null,
        query: rawText,
        needsDeviceSelection: false
      },
      reply: typeof data.reply === "string" ? data.reply : undefined
    };
  }

  async searchFiles(commandId: string, query?: string, requestedKind?: string, targetDeviceId?: string) {
    const data = await this.request<{ results?: FileResult[] }>(`/commands/${commandId}/search-files`, {
      method: "POST",
      body: { query, requestedKind, targetDeviceId, limit: 8 }
    });

    return {
      results: Array.isArray(data.results)
        ? data.results.filter((result) => Boolean(result?.localFileId))
        : []
    };
  }

  async selectFile(commandId: string, file: FileResult) {
    const data = await this.request<{ confirmation?: Confirmation }>(`/commands/${commandId}/select-file`, {
      method: "POST",
      body: {
        localFileId: file.localFileId,
        fileName: file.fileName,
        fileSize: file.fileSize,
        sourceDeviceId: file.deviceId
      }
    });

    return {
      confirmation: ensureIdentified(data.confirmation, "Confirmacao")
    };
  }

  async confirm(confirmationId: string, phrase: string) {
    return this.request(`/confirmations/${confirmationId}/confirm`, {
      method: "POST",
      body: { phrase }
    });
  }

  private setToken(token: string) {
    this.token = token;
    if (token) {
      localStorage.setItem("jarvis_token", token);
    } else {
      localStorage.removeItem("jarvis_token");
    }
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown } = {}, auth = true): Promise<T> {
    const response = await fetch(`${jarvisApiUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(auth && this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      body: init.body ? JSON.stringify(init.body) : undefined
    }).catch(() => {
      throw new Error("Nao foi possivel conectar a API Jarvis. Verifique se o servico esta online e liberado no CORS.");
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error ?? "Falha na API Jarvis.");
    }
    return data;
  }
}

export const jarvisApi = new JarvisApi();
