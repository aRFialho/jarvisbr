import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Cpu,
  Download,
  Link2,
  LogOut,
  Mic,
  RefreshCw,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Volume2
} from "lucide-react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { HoloAvatar } from "../../components/HoloAvatar";
import {
  type Confirmation,
  type Device,
  type FileResult,
  type HoloState,
  type PairingCode,
  type ServiceHealth,
  type Settings as JarvisSettings,
  jarvisApi
} from "../../lib/api";

type Tab = "chat" | "devices" | "install" | "health" | "settings";

const sampleCommand = "Jarvis, no computador Casa tem uma imagem chamada logo azul. Baixe ela para mim.";
const apiUrl = import.meta.env.VITE_API_URL ?? "https://jarvis-api.onrender.com";

export function Dashboard() {
  const [isAuthed, setIsAuthed] = useState(jarvisApi.authenticated);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [email, setEmail] = useState("alan@example.com");
  const [password, setPassword] = useState("jarvis-demo-123");
  const [name, setName] = useState("Alan");
  const [devices, setDevices] = useState<Device[]>([]);
  const [settings, setSettings] = useState<JarvisSettings | null>(null);
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [desktopPairing, setDesktopPairing] = useState<PairingCode | null>(null);
  const [mobilePairing, setMobilePairing] = useState<PairingCode | null>(null);
  const [installMessage, setInstallMessage] = useState("Agent de segundo plano ainda nao instalado nesta maquina.");
  const [command, setCommand] = useState(sampleCommand);
  const [commandId, setCommandId] = useState("");
  const [results, setResults] = useState<FileResult[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileResult | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [phrase, setPhrase] = useState("");
  const [holoState, setHoloState] = useState<HoloState>("idle");
  const [message, setMessage] = useState("Chat por voz e texto pronto. Eu sempre peço confirmacao antes de agir.");

  const assistantName = settings?.assistant_name ?? "Jarvis";
  const hasDesktopAgent = useMemo(
    () => devices.some((device) => ["desktop", "notebook"].includes(device.device_type)),
    [devices]
  );

  useEffect(() => {
    if (isAuthed) {
      refreshAll().catch(showError);
    }
  }, [isAuthed]);

  async function refreshAll() {
    const [deviceData, settingsData, healthData] = await Promise.all([
      jarvisApi.devices(),
      jarvisApi.settings(),
      jarvisApi.serviceHealth()
    ]);
    setDevices(deviceData.devices);
    setSettings(settingsData.settings);
    setHealth(healthData);
  }

  async function handleAuth(mode: "login" | "register") {
    try {
      setHoloState("thinking");
      if (mode === "register") {
        await jarvisApi.register(name, email, password);
      } else {
        await jarvisApi.login(email, password);
      }
      setIsAuthed(true);
      setMessage("Conta conectada. Instale o agent no desktop e depois vincule o Android por codigo.");
      setHoloState("idle");
    } catch (error) {
      showError(error);
    }
  }

  async function runCommand() {
    try {
      setHoloState("listening");
      setMessage(command);
      speak(`${assistantName} analisando o pedido.`);
      setResults([]);
      setSelectedFile(null);
      setConfirmation(null);

      const created = await jarvisApi.createCommand(command);
      setCommandId(created.command.id);
      setHoloState("searching");
      setMessage(`Buscando arquivos parecidos com "${created.interpreted.query}" no aparelho alvo.`);

      const found = await jarvisApi.searchFiles(created.command.id, created.interpreted.query, created.interpreted.requestedKind);
      setResults(found.results);
      setHoloState("confirming");
      setMessage("Encontrei estas opcoes. Escolha visualmente o arquivo correto.");
      speak("Encontrei opcoes parecidas. Escolha o arquivo correto.");
    } catch (error) {
      showError(error);
    }
  }

  async function chooseFile(file: FileResult) {
    try {
      setSelectedFile(file);
      setHoloState("confirming");
      setMessage(`Vou montar o plano para baixar ${file.fileName}.`);
      const data = await jarvisApi.selectFile(commandId, file);
      setConfirmation(data.confirmation);
      setPhrase("");
      speak("Confirmacao obrigatoria. Diga ou digite Confirmo para executar.");
    } catch (error) {
      showError(error);
    }
  }

  async function confirmAction() {
    if (!confirmation) return;
    try {
      setHoloState("executing");
      setMessage("Confirmacao validada. Enviando token curto ao agent autorizado.");
      await jarvisApi.confirm(confirmation.id, phrase);
      setConfirmation(null);
      setHoloState("done");
      setMessage("Acao liberada com seguranca. Se o agent estiver online, ele inicia a transferencia.");
      speak("Acao confirmada e liberada com seguranca.");
      await refreshAll();
    } catch (error) {
      showError(error);
    }
  }

  function startVoiceCapture() {
    const SpeechRecognition = (window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setHoloState("error");
      setMessage("Este navegador nao liberou reconhecimento de voz. Use texto por enquanto.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.onstart = () => {
      setHoloState("listening");
      setMessage("Ouvindo...");
    };
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setCommand(text);
      setMessage(text);
      setHoloState("thinking");
    };
    recognition.onerror = () => showError(new Error("Nao consegui ouvir com clareza."));
    recognition.start();
  }

  async function createDesktopPairing() {
    const pairing = await jarvisApi.createPairingCode("Desktop Agent");
    setDesktopPairing(pairing);
    setInstallMessage("Codigo liberado. Execute o instalador no Windows; o agent ficara em segundo plano.");
  }

  async function createMobilePairing() {
    const pairing = await jarvisApi.createPairingCode("Android");
    setMobilePairing(pairing);
    setMessage("Codigo Android gerado. Ao abrir o APK, a primeira tela pedira esse codigo.");
  }

  async function saveSettings() {
    if (!settings) return;
    const data = await jarvisApi.updateSettings({
      assistantName: settings.assistant_name,
      wakePhrases: settings.wake_phrases,
      responseTone: settings.response_tone,
      humorLevel: Number(settings.humor_level),
      slangLevel: Number(settings.slang_level),
      answerLength: settings.answer_length,
      assistantAvatarUrl: settings.assistant_avatar_url ?? "",
      agentAvatarUrl: settings.agent_avatar_url ?? "",
      floatingButtonEnabled: settings.floating_button_enabled,
      alwaysListeningEnabled: settings.always_listening_enabled
    });
    setSettings(data.settings);
    setHoloState("done");
    setMessage("Personalidade atualizada. Permissoes de seguranca continuam iguais.");
  }

  function updateSetting<K extends keyof JarvisSettings>(key: K, value: JarvisSettings[K]) {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  }

  function showError(error: unknown) {
    setHoloState("error");
    setMessage(error instanceof Error ? error.message : "Operacao bloqueada por seguranca.");
  }

  if (!isAuthed) {
    return (
      <main className="shell auth-shell">
        <HoloAvatar state={holoState} assistantName="Jarvis" transcript="Entre ou crie sua conta para vincular apenas aparelhos proprios." />
        <section className="auth-panel">
          <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>E-mail<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <div className="toolbar">
            <button className="primary-button" type="button" onClick={() => handleAuth("register")}>Criar conta</button>
            <button className="ghost-button" type="button" onClick={() => handleAuth("login")}>Entrar</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell wide-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Jarvis BR</span>
          <h2>Console holografico multidispositivo</h2>
        </div>
        <div className="toolbar">
          <button className="icon-button" type="button" onClick={refreshAll} aria-label="Atualizar"><RefreshCw size={18} /></button>
          <button className="icon-button" type="button" onClick={() => { jarvisApi.logout(); setIsAuthed(false); }} aria-label="Sair"><LogOut size={18} /></button>
        </div>
      </header>

      <section className="console-layout">
        <aside className="nav-rail">
          <TabButton active={activeTab === "chat"} icon={<Bot size={18} />} label="Chat" onClick={() => setActiveTab("chat")} />
          <TabButton active={activeTab === "devices"} icon={<Cpu size={18} />} label="Aparelhos" onClick={() => setActiveTab("devices")} />
          <TabButton active={activeTab === "install"} icon={<Download size={18} />} label="Instalar Agent" onClick={() => setActiveTab("install")} />
          <TabButton active={activeTab === "health"} icon={<Activity size={18} />} label="Health" onClick={() => setActiveTab("health")} />
          <TabButton active={activeTab === "settings"} icon={<SlidersHorizontal size={18} />} label="Configuracoes" onClick={() => setActiveTab("settings")} />
        </aside>

        <HoloAvatar state={holoState} assistantName={assistantName} transcript={message} audioLevel={holoState === "listening" ? 0.84 : 0.42} />

        <section className="control-deck">
          {activeTab === "chat" && (
            <ChatPanel
              command={command}
              setCommand={setCommand}
              runCommand={runCommand}
              startVoiceCapture={startVoiceCapture}
              results={results}
              selectedFile={selectedFile}
              chooseFile={chooseFile}
            />
          )}
          {activeTab === "devices" && (
            <DevicesPanel devices={devices} mobilePairing={mobilePairing} createMobilePairing={createMobilePairing} />
          )}
          {activeTab === "install" && (
            <InstallPanel
              hasDesktopAgent={hasDesktopAgent}
              pairing={desktopPairing}
              createPairing={createDesktopPairing}
              installMessage={installMessage}
            />
          )}
          {activeTab === "health" && <HealthPanel health={health} devices={devices} />}
          {activeTab === "settings" && settings && (
            <SettingsPanel settings={settings} updateSetting={updateSetting} saveSettings={saveSettings} />
          )}
        </section>
      </section>

      {confirmation && (
        <ConfirmationModal
          confirmation={confirmation}
          phrase={phrase}
          onPhraseChange={setPhrase}
          onConfirm={confirmAction}
          onCancel={() => setConfirmation(null)}
        />
      )}
    </main>
  );
}

function ChatPanel(props: {
  command: string;
  setCommand: (value: string) => void;
  runCommand: () => void;
  startVoiceCapture: () => void;
  results: FileResult[];
  selectedFile: FileResult | null;
  chooseFile: (file: FileResult) => void;
}) {
  return (
    <>
      <div className="command-row">
        <button className="orb-button" type="button" aria-label="Capturar voz" onClick={props.startVoiceCapture}>
          <Mic size={22} />
        </button>
        <textarea value={props.command} onChange={(event) => props.setCommand(event.target.value)} />
        <button className="primary-button send-button" type="button" onClick={props.runCommand}>
          <Send size={18} /> Enviar
        </button>
      </div>
      <div className="results-grid">
        {props.results.map((file, index) => (
          <button
            className={`file-card ${props.selectedFile?.localFileId === file.localFileId ? "selected" : ""}`}
            type="button"
            key={file.localFileId}
            onClick={() => props.chooseFile(file)}
          >
            <span className="thumb">{file.fileKind === "image" ? "IMG" : "DOC"}</span>
            <span className="rank">{index + 1}</span>
            <strong>{file.fileName}</strong>
            <small>{file.filePathHint}</small>
            <span>{formatBytes(file.fileSize)} - {new Date(file.modifiedAt).toLocaleDateString("pt-BR")} - {Math.round(file.score * 100)}%</span>
            <Download size={18} />
          </button>
        ))}
      </div>
    </>
  );
}

function DevicesPanel({ devices, mobilePairing, createMobilePairing }: {
  devices: Device[];
  mobilePairing: PairingCode | null;
  createMobilePairing: () => void;
}) {
  return (
    <div className="panel-stack">
      <div className="section-title"><Smartphone size={19} /> Aparelhos vinculados</div>
      <div className="device-grid">
        {devices.map((device) => (
          <div className="device-card" key={device.id}>
            <Shield size={18} />
            <strong>{device.friendly_name}</strong>
            <span>{device.device_type} - {device.platform}</span>
            <small>{device.status}</small>
          </div>
        ))}
      </div>
      <button className="primary-button" type="button" onClick={createMobilePairing}>
        <Link2 size={18} /> Gerar codigo para Android
      </button>
      {mobilePairing && (
        <div className="pairing-code">
          <span>Codigo Android</span>
          <strong>{mobilePairing.code}</strong>
          <small>Ao abrir o APK, digite este codigo para entrar ja vinculado a esta conta.</small>
        </div>
      )}
    </div>
  );
}

function InstallPanel({ hasDesktopAgent, pairing, createPairing, installMessage }: {
  hasDesktopAgent: boolean;
  pairing: PairingCode | null;
  createPairing: () => void;
  installMessage: string;
}) {
  const command = pairing
    ? `powershell -ExecutionPolicy Bypass -File .\\agents\\windows\\install-agent.ps1 -ApiUrl "${apiUrl}" -PairingCode "${pairing.code}"`
    : "Gere um codigo primeiro.";

  return (
    <div className="panel-stack">
      <div className="section-title"><Cpu size={19} /> Agent desktop em segundo plano</div>
      <p className="muted-copy">{installMessage}</p>
      <div className={`status-banner ${hasDesktopAgent ? "online" : ""}`}>
        {hasDesktopAgent ? "Agent desktop detectado no cadastro." : "Agent desktop ainda nao detectado."}
      </div>
      <button className="primary-button" type="button" onClick={createPairing}>
        <Link2 size={18} /> Liberar chave de vinculacao
      </button>
      <pre className="install-command">{command}</pre>
      <p className="muted-copy">
        O instalador configura uma tarefa de segundo plano no Windows, pareia o desktop e tenta baixar o APK Android quando uma URL de APK estiver configurada no backend.
      </p>
      {pairing && <div className="pairing-code"><span>Chave temporaria</span><strong>{pairing.code}</strong><small>Expira em poucos minutos.</small></div>}
    </div>
  );
}

function HealthPanel({ health, devices }: { health: ServiceHealth | null; devices: Device[] }) {
  return (
    <div className="panel-stack">
      <div className="section-title"><Activity size={19} /> Health service</div>
      <div className="metric-grid">
        <Metric label="API" value={health?.api ?? "checking"} />
        <Metric label="Banco" value={health?.database ?? "checking"} />
        <Metric label="Aparelhos" value={String(health?.devices.total ?? devices.length)} />
        <Metric label="Online" value={String(health?.devices.online ?? 0)} />
        <Metric label="Confirmacoes pendentes" value={String(health?.confirmations.pending ?? 0)} />
        <Metric label="Comandos 24h" value={String(health?.commands.total_today ?? 0)} />
      </div>
    </div>
  );
}

function SettingsPanel({ settings, updateSetting, saveSettings }: {
  settings: JarvisSettings;
  updateSetting: <K extends keyof JarvisSettings>(key: K, value: JarvisSettings[K]) => void;
  saveSettings: () => void;
}) {
  return (
    <div className="settings-grid">
      <label>Nome do assistente<input value={settings.assistant_name} onChange={(event) => updateSetting("assistant_name", event.target.value)} /></label>
      <label>Wake words<input value={settings.wake_phrases.join(", ")} onChange={(event) => updateSetting("wake_phrases", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></label>
      <label>Tom<select value={settings.response_tone} onChange={(event) => updateSetting("response_tone", event.target.value)}>
        <option value="futurista_direto">Futurista direto</option>
        <option value="brasileiro_direto">Brasileiro direto</option>
        <option value="secretaria_profissional">Secretaria profissional</option>
        <option value="robotico_futurista">Robotico futurista</option>
      </select></label>
      <label>Resposta<select value={settings.answer_length} onChange={(event) => updateSetting("answer_length", event.target.value)}>
        <option value="curta_objetiva">Curta objetiva</option>
        <option value="equilibrada">Equilibrada</option>
        <option value="detalhada">Detalhada</option>
      </select></label>
      <label>Humor<input type="range" min="0" max="1" step="0.05" value={settings.humor_level} onChange={(event) => updateSetting("humor_level", Number(event.target.value))} /></label>
      <label>Giria<input type="range" min="0" max="1" step="0.05" value={settings.slang_level} onChange={(event) => updateSetting("slang_level", Number(event.target.value))} /></label>
      <label>Foto perfil assistente<input value={settings.assistant_avatar_url ?? ""} onChange={(event) => updateSetting("assistant_avatar_url", event.target.value)} /></label>
      <label>Foto agent<input value={settings.agent_avatar_url ?? ""} onChange={(event) => updateSetting("agent_avatar_url", event.target.value)} /></label>
      <label className="toggle-row"><input type="checkbox" checked={settings.floating_button_enabled} onChange={(event) => updateSetting("floating_button_enabled", event.target.checked)} /> Botao flutuante</label>
      <label className="toggle-row"><input type="checkbox" checked={settings.always_listening_enabled} onChange={(event) => updateSetting("always_listening_enabled", event.target.checked)} /> Wake word opcional</label>
      <button className="primary-button" type="button" onClick={saveSettings}><Settings size={18} /> Salvar configuracoes</button>
    </div>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? "active" : ""}`} type="button" onClick={onClick}>{icon}<span>{label}</span></button>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  utterance.rate = 1.04;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};
