export type HoloState = "idle" | "listening" | "thinking" | "searching" | "confirming" | "executing" | "done" | "error";

const apiUrl = import.meta.env.VITE_API_URL ?? import.meta.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
    return this.request<{ devices: Device[] }>("/devices");
  }

  async settings() {
    return this.request<{ settings: Settings; voices: unknown[] }>("/me/settings");
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
    return this.request<PairingCode>("/devices/pairing-code", {
      method: "POST",
      body: { requestedDeviceName }
    });
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
    return this.request<{ command: { id: string }; interpreted: { query: string; requestedKind?: string } }>("/commands", {
      method: "POST",
      body: { rawText }
    });
  }

  async searchFiles(commandId: string, query?: string, requestedKind?: string) {
    return this.request<{ results: FileResult[] }>(`/commands/${commandId}/search-files`, {
      method: "POST",
      body: { query, requestedKind, limit: 8 }
    });
  }

  async selectFile(commandId: string, file: FileResult) {
    return this.request<{ confirmation: Confirmation }>(`/commands/${commandId}/select-file`, {
      method: "POST",
      body: {
        localFileId: file.localFileId,
        fileName: file.fileName,
        fileSize: file.fileSize,
        sourceDeviceId: file.deviceId
      }
    });
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
    const response = await fetch(`${apiUrl}${path}`, {
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
