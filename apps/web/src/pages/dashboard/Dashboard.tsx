import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Copy,
  Cpu,
  Download,
  Globe2,
  HardDrive,
  Keyboard,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  MessageSquare,
  Mic,
  Monitor,
  Network,
  Orbit,
  Radio,
  RefreshCw,
  Send,
  Server,
  Settings,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  TabletSmartphone,
  User,
  Volume2,
  Waves,
  Wifi,
  Zap
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

type Tab = "chat" | "voice" | "account" | "settings" | "devices" | "install" | "ecosystem" | "health";
type InteractionMode = "voice" | "text";

const sampleCommand = "Jarvis, no computador Casa tem uma imagem chamada logo azul. Baixe ela para mim.";
const apiUrl = import.meta.env.VITE_API_URL ?? "https://jarvis-api.onrender.com";

const navItems: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: "chat", label: "Chat", icon: <MessageSquare size={18} /> },
  { id: "voice", label: "Voz e Texto", icon: <Volume2 size={18} /> },
  { id: "account", label: "Conta", icon: <User size={18} /> },
  { id: "settings", label: "Configuracoes", icon: <SlidersHorizontal size={18} /> },
  { id: "devices", label: "Adicionar Aparelhos", icon: <TabletSmartphone size={18} /> },
  { id: "install", label: "Instalar Agente", icon: <Download size={18} /> },
  { id: "ecosystem", label: "Operar Multiplataforma", icon: <Network size={18} /> },
  { id: "health", label: "Health Service", icon: <Activity size={18} /> }
];

export function Dashboard() {
  const [isAuthed, setIsAuthed] = useState(jarvisApi.authenticated);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [email, setEmail] = useState("jarvisbr@admin.com.br");
  const [password, setPassword] = useState("JAlan@192837");
  const [name, setName] = useState("Super Admin");
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
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("voice");
  const [message, setMessage] = useState("Chat por voz e texto pronto. Eu sempre peco confirmacao antes de agir.");
  const [copyStatus, setCopyStatus] = useState("");

  const assistantName = settings?.assistant_name ?? "Jarvis";
  const desktopDevices = useMemo(
    () => devices.filter((device) => ["desktop", "notebook"].includes(device.device_type)),
    [devices]
  );
  const mobileDevices = useMemo(
    () => devices.filter((device) => ["mobile", "tablet"].includes(device.device_type)),
    [devices]
  );
  const webDevices = useMemo(() => devices.filter((device) => device.device_type === "web"), [devices]);
  const hasDesktopAgent = desktopDevices.length > 0;
  const hasAndroid = mobileDevices.length > 0;
  const onlineCount = devices.filter((device) => device.status === "online").length;

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
      setHoloState("done");
    } catch (error) {
      showError(error);
    }
  }

  async function runCommand() {
    try {
      setHoloState(interactionMode === "voice" ? "listening" : "thinking");
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
      setInteractionMode("voice");
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

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copiado`);
      window.setTimeout(() => setCopyStatus(""), 1800);
    } catch {
      setCopyStatus("Nao foi possivel copiar neste navegador");
    }
  }

  function showError(error: unknown) {
    setHoloState("error");
    setMessage(error instanceof Error ? error.message : "Operacao bloqueada por seguranca.");
  }

  if (!isAuthed) {
    return (
      <main className="jarvis-shell auth-shell">
        <AmbientField />
        <header className="auth-brand">
          <BrandMark />
          <p>Seu assistente inteligente. Todos os seus dispositivos. Uma unica experiencia.</p>
        </header>
        <section className="auth-hero">
          <HoloAvatar state={holoState} assistantName="Jarvis" transcript="Entre ou crie sua conta para vincular apenas aparelhos proprios." />
        </section>
        <section className="auth-panel holo-card">
          <PanelTitle icon={<Lock size={18} />} title="Acesso seguro" subtitle="Web Control Center" />
          <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>E-mail<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <div className="toolbar">
            <button className="primary-button" type="button" onClick={() => handleAuth("register")}>Criar conta</button>
            <button className="ghost-button" type="button" onClick={() => handleAuth("login")}>Entrar</button>
          </div>
          <div className="auth-mini-grid">
            <StatusPill label="Criptografia" value="Ativa" tone="good" />
            <StatusPill label="Confirmacao" value="Obrigatoria" tone="cyan" />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="jarvis-shell">
      <AmbientField />
      <header className="jarvis-header">
        <div className="brand-cluster">
          <BrandMark />
          <p>Seu assistente inteligente. Todos os seus dispositivos. Uma unica experiencia.</p>
        </div>
        <div className="platform-flow" aria-label="Fluxo de plataformas">
          <PlatformBadge icon={<Globe2 size={18} />} label="Web Control Center" />
          <ChevronRight size={18} />
          <PlatformBadge icon={<Monitor size={18} />} label="Agent Desktop" />
          <ChevronRight size={18} />
          <PlatformBadge icon={<Smartphone size={18} />} label="Android APK" />
        </div>
        <div className="toolbar header-tools">
          <span className="status-dot-label"><span className="status-dot online" /> {onlineCount} online</span>
          <button className="icon-button" type="button" onClick={refreshAll} aria-label="Atualizar"><RefreshCw size={18} /></button>
          <button className="icon-button" type="button" onClick={() => { jarvisApi.logout(); setIsAuthed(false); }} aria-label="Sair"><LogOut size={18} /></button>
        </div>
      </header>

      <section className="jarvis-console">
        <aside className="nav-rail holo-card">
          <div className="nav-orb">
            <Orbit size={26} />
            <span>JARVIS</span>
          </div>
          <div className="nav-list">
            {navItems.map((item) => (
              <TabButton
                key={item.id}
                active={activeTab === item.id}
                icon={item.icon}
                label={item.label}
                onClick={() => setActiveTab(item.id)}
              />
            ))}
          </div>
          <div className="user-chip">
            <div className="avatar-dot">A</div>
            <div>
              <strong>Ola, Usuario</strong>
              <span>Plano Premium</span>
            </div>
            <BadgeCheck size={16} />
          </div>
        </aside>

        <section className="holo-stage">
          <HoloAvatar
            state={holoState}
            assistantName={assistantName}
            transcript={message}
            audioLevel={holoState === "listening" ? 0.9 : holoState === "executing" ? 0.7 : 0.42}
          />
          <StatusStrip
            desktopOnline={hasDesktopAgent}
            androidOnline={hasAndroid}
            mobilePairing={mobilePairing}
            desktopPairing={desktopPairing}
          />
        </section>

        <section className="control-deck holo-card">
          {activeTab === "chat" && (
            <ChatPanel
              command={command}
              setCommand={setCommand}
              runCommand={runCommand}
              startVoiceCapture={startVoiceCapture}
              results={results}
              selectedFile={selectedFile}
              chooseFile={chooseFile}
              interactionMode={interactionMode}
              setInteractionMode={setInteractionMode}
              assistantName={assistantName}
            />
          )}
          {activeTab === "voice" && (
            <VoiceTextPanel
              mode={interactionMode}
              setMode={setInteractionMode}
              holoState={holoState}
              startVoiceCapture={startVoiceCapture}
              setHoloState={setHoloState}
            />
          )}
          {activeTab === "account" && (
            <AccountPanel
              devices={devices}
              health={health}
              hasDesktopAgent={hasDesktopAgent}
              hasAndroid={hasAndroid}
              email={email}
            />
          )}
          {activeTab === "settings" && settings && (
            <SettingsPanel settings={settings} updateSetting={updateSetting} saveSettings={saveSettings} assistantName={assistantName} />
          )}
          {activeTab === "devices" && (
            <DevicesPanel
              devices={devices}
              mobilePairing={mobilePairing}
              desktopOnline={hasDesktopAgent}
              androidOnline={hasAndroid}
              webOnline={webDevices.length > 0}
              createMobilePairing={createMobilePairing}
            />
          )}
          {activeTab === "install" && (
            <InstallPanel
              hasDesktopAgent={hasDesktopAgent}
              pairing={desktopPairing}
              createPairing={createDesktopPairing}
              installMessage={installMessage}
              copyToClipboard={copyToClipboard}
              copyStatus={copyStatus}
            />
          )}
          {activeTab === "ecosystem" && (
            <EcosystemPanel
              desktopOnline={hasDesktopAgent}
              androidOnline={hasAndroid}
              webOnline={webDevices.length > 0}
            />
          )}
          {activeTab === "health" && <HealthPanel health={health} devices={devices} />}
        </section>
      </section>

      <FooterSignals />

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
  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;
  assistantName: string;
}) {
  return (
    <div className="tab-panel tab-chat">
      <PanelTitle icon={<Bot size={18} />} title="Chat" subtitle="Comando inteligente com confirmacao segura" />
      <div className="chat-grid">
        <section className="message-stream">
          <div className="message-row user">
            <span>Usuario</span>
            <p>{props.command}</p>
          </div>
          <div className="message-row assistant">
            <span>{props.assistantName}</span>
            <p className="typing-line">Analisando contexto, dispositivos e permissoes...</p>
          </div>
        </section>
        <section className="mode-switcher">
          <button className={props.interactionMode === "voice" ? "mode-card active" : "mode-card"} type="button" onClick={() => props.setInteractionMode("voice")}>
            <Mic size={22} />
            <strong>Voz</strong>
            <small>Ondas, escuta e resposta falada</small>
          </button>
          <button className={props.interactionMode === "text" ? "mode-card active" : "mode-card"} type="button" onClick={() => props.setInteractionMode("text")}>
            <Keyboard size={22} />
            <strong>Texto</strong>
            <small>Entrada precisa com efeito neon</small>
          </button>
        </section>
      </div>
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
            style={{ "--delay": `${index * 80}ms` } as CSSProperties}
          >
            <span className="thumb">{file.fileKind === "image" ? "IMG" : "DOC"}</span>
            <span className="rank">{index + 1}</span>
            <strong>{file.fileName}</strong>
            <small>{file.filePathHint}</small>
            <span>{formatBytes(file.fileSize)} | {new Date(file.modifiedAt).toLocaleDateString("pt-BR")} | {Math.round(file.score * 100)}%</span>
            <Download size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

function VoiceTextPanel({ mode, setMode, holoState, startVoiceCapture, setHoloState }: {
  mode: InteractionMode;
  setMode: (mode: InteractionMode) => void;
  holoState: HoloState;
  startVoiceCapture: () => void;
  setHoloState: (state: HoloState) => void;
}) {
  return (
    <div className="tab-panel">
      <PanelTitle icon={<Waves size={18} />} title="Voz e Texto" subtitle="Modos de interacao com telemetria visual" />
      <div className="voice-layout">
        <button className={mode === "voice" ? "interaction-card active" : "interaction-card"} type="button" onClick={() => setMode("voice")}>
          <Mic size={26} />
          <strong>Modo voz</strong>
          <span>Ouvindo, falando e processando com ondas holograficas.</span>
          <div className="sound-bars" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
        </button>
        <button className={mode === "text" ? "interaction-card active" : "interaction-card"} type="button" onClick={() => setMode("text")}>
          <Keyboard size={26} />
          <strong>Modo texto</strong>
          <span>Entrada direta com confirmacao visual e resposta digitada.</span>
          <div className="text-scan" aria-hidden="true" />
        </button>
      </div>
      <div className="status-matrix">
        <SignalCard label="Ouvindo" icon={<Radio size={18} />} active={holoState === "listening"} onClick={startVoiceCapture} />
        <SignalCard label="Falando" icon={<Volume2 size={18} />} active={holoState === "executing"} onClick={() => setHoloState("executing")} />
        <SignalCard label="Processando" icon={<Cpu size={18} />} active={["thinking", "searching"].includes(holoState)} onClick={() => setHoloState("thinking")} />
        <SignalCard label="Pronto" icon={<CheckCircle2 size={18} />} active={holoState === "idle" || holoState === "done"} onClick={() => setHoloState("idle")} />
      </div>
    </div>
  );
}

function AccountPanel({ devices, health, hasDesktopAgent, hasAndroid, email }: {
  devices: Device[];
  health: ServiceHealth | null;
  hasDesktopAgent: boolean;
  hasAndroid: boolean;
  email: string;
}) {
  return (
    <div className="tab-panel">
      <PanelTitle icon={<User size={18} />} title="Conta" subtitle="Perfil, plano e dispositivos conectados" />
      <div className="account-grid">
        <section className="profile-card">
          <div className="profile-avatar">A</div>
          <div>
            <h3>Usuario Premium</h3>
            <p>{email}</p>
            <div className="badge-row">
              <span className="badge premium">Premium</span>
              <span className="badge good">Ativo</span>
              <span className="badge cyan">Online</span>
            </div>
          </div>
        </section>
        <Metric label="Dispositivos" value={String(devices.length)} icon={<TabletSmartphone size={18} />} />
        <Metric label="Desktop Agent" value={hasDesktopAgent ? "Online" : "Aguardando"} icon={<Monitor size={18} />} />
        <Metric label="Android" value={hasAndroid ? "Vinculado" : "Pendente"} icon={<Smartphone size={18} />} />
        <Metric label="Comandos 24h" value={String(health?.commands.total_today ?? 0)} icon={<Zap size={18} />} />
      </div>
      <div className="device-grid">
        {devices.length === 0 && <EmptyState icon={<Wifi size={20} />} title="Nenhum aparelho conectado" copy="Use as abas Adicionar Aparelhos e Instalar Agente para iniciar o ecossistema." />}
        {devices.map((device) => <DeviceCard key={device.id} device={device} />)}
      </div>
    </div>
  );
}

function SettingsPanel({ settings, updateSetting, saveSettings, assistantName }: {
  settings: JarvisSettings;
  updateSetting: <K extends keyof JarvisSettings>(key: K, value: JarvisSettings[K]) => void;
  saveSettings: () => void;
  assistantName: string;
}) {
  return (
    <div className="tab-panel">
      <PanelTitle icon={<Settings size={18} />} title="Configuracoes do Agente" subtitle="Personalidade, voz, efeitos e preview holografico" />
      <div className="settings-layout">
        <section className="settings-grid">
          <label>Nome do assistente<input value={settings.assistant_name} onChange={(event) => updateSetting("assistant_name", event.target.value)} /></label>
          <label>Wake words<input value={settings.wake_phrases.join(", ")} onChange={(event) => updateSetting("wake_phrases", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></label>
          <label>Tom<select value={settings.response_tone} onChange={(event) => updateSetting("response_tone", event.target.value)}>
            <option value="futurista_direto">Futurista direto</option>
            <option value="brasileiro_direto">Brasileiro direto</option>
            <option value="secretaria_profissional">Secretaria profissional</option>
            <option value="robotico_futurista">Robotico futurista</option>
          </select></label>
          <label>Humor<select value={settings.answer_length} onChange={(event) => updateSetting("answer_length", event.target.value)}>
            <option value="curta_objetiva">Prestativo direto</option>
            <option value="equilibrada">Equilibrado premium</option>
            <option value="detalhada">Detalhado consultivo</option>
          </select></label>
          <label>Personalidade<input type="range" min="0" max="1" step="0.05" value={settings.humor_level} onChange={(event) => updateSetting("humor_level", Number(event.target.value))} /></label>
          <label>Velocidade da fala<input type="range" min="0" max="1" step="0.05" value={settings.slang_level} onChange={(event) => updateSetting("slang_level", Number(event.target.value))} /></label>
          <label>Foto perfil assistente<input value={settings.assistant_avatar_url ?? ""} onChange={(event) => updateSetting("assistant_avatar_url", event.target.value)} /></label>
          <label>Foto do Agent<input value={settings.agent_avatar_url ?? ""} onChange={(event) => updateSetting("agent_avatar_url", event.target.value)} /></label>
          <label className="toggle-row"><input type="checkbox" checked={settings.floating_button_enabled} onChange={(event) => updateSetting("floating_button_enabled", event.target.checked)} /> Botao flutuante</label>
          <label className="toggle-row"><input type="checkbox" checked={settings.always_listening_enabled} onChange={(event) => updateSetting("always_listening_enabled", event.target.checked)} /> Wake word opcional</label>
          <button className="primary-button" type="button" onClick={saveSettings}><Settings size={18} /> Salvar configuracoes</button>
        </section>
        <section className="preview-panel">
          <span className="eyebrow">Preview</span>
          <div className="mini-hologram">
            <span />
            <strong>{assistantName}</strong>
          </div>
          <div className="color-swatches" aria-label="Cores do holograma">
            <button className="swatch cyan active" type="button" aria-label="Ciano" />
            <button className="swatch blue" type="button" aria-label="Azul" />
            <button className="swatch green" type="button" aria-label="Verde" />
          </div>
          <p>Intensidade visual e microinteracoes acompanham os estados do holograma sem alterar regras do backend.</p>
        </section>
      </div>
    </div>
  );
}

function DevicesPanel({ devices, mobilePairing, createMobilePairing, webOnline, desktopOnline, androidOnline }: {
  devices: Device[];
  mobilePairing: PairingCode | null;
  createMobilePairing: () => void;
  webOnline: boolean;
  desktopOnline: boolean;
  androidOnline: boolean;
}) {
  return (
    <div className="tab-panel">
      <PanelTitle icon={<TabletSmartphone size={18} />} title="Adicionar Aparelhos" subtitle="Vinculacao visual Web, Desktop Agent e Android" />
      <DeviceFlow webOnline={webOnline} desktopOnline={desktopOnline} androidOnline={androidOnline} />
      <div className="device-grid">
        {devices.map((device) => <DeviceCard key={device.id} device={device} />)}
      </div>
      <div className="action-strip">
        <button className="primary-button" type="button" onClick={createMobilePairing}>
          <KeyRound size={18} /> Gerar codigo Android
        </button>
        {mobilePairing && (
          <div className="pairing-code compact-code">
            <span>Codigo Android</span>
            <strong>{mobilePairing.code}</strong>
            <small>Digite este codigo na primeira tela do APK.</small>
          </div>
        )}
      </div>
      <AndroidMockupFlow code={mobilePairing?.code} />
    </div>
  );
}

function InstallPanel({ hasDesktopAgent, pairing, createPairing, installMessage, copyToClipboard, copyStatus }: {
  hasDesktopAgent: boolean;
  pairing: PairingCode | null;
  createPairing: () => void;
  installMessage: string;
  copyToClipboard: (text: string, label: string) => void;
  copyStatus: string;
}) {
  const command = pairing
    ? `powershell -ExecutionPolicy Bypass -File .\\agents\\windows\\install-agent.ps1 -ApiUrl "${apiUrl}" -PairingCode "${pairing.code}"`
    : "Gere uma chave de vinculacao primeiro.";
  const apkPath = "C:\\Users\\User\\Downloads\\JarvisAgent.apk";

  return (
    <div className="tab-panel">
      <PanelTitle icon={<Cpu size={18} />} title="Instalar Agente" subtitle="Desktop Agent silencioso e APK Android sincronizado" />
      <div className="install-grid">
        <section className="agent-card">
          <Monitor size={30} />
          <h3>Agent Desktop</h3>
          <p>{installMessage}</p>
          <StatusPill label="Status" value={hasDesktopAgent ? "Agent em execucao" : "Aguardando instalacao"} tone={hasDesktopAgent ? "good" : "warning"} />
          <button className="primary-button" type="button" onClick={createPairing}>
            <Link2 size={18} /> Gerar chave de vinculacao
          </button>
        </section>
        <section className="agent-card">
          <HardDrive size={30} />
          <h3>APK baixado automaticamente</h3>
          <p>Quando a URL do APK estiver configurada no backend, o instalador salva o arquivo localmente para vinculacao Android.</p>
          <div className="path-row">
            <code>{apkPath}</code>
            <button className="icon-button" type="button" onClick={() => copyToClipboard(apkPath, "Caminho do APK")} aria-label="Copiar caminho"><Copy size={17} /></button>
          </div>
        </section>
      </div>
      <div className="terminal-panel">
        <div className="terminal-head">
          <span>Comando do instalador</span>
          <button className="ghost-button compact" type="button" onClick={() => copyToClipboard(command, "Comando")}>
            <Copy size={16} /> Copiar
          </button>
        </div>
        <pre>{command}</pre>
      </div>
      {pairing && <div className="pairing-code"><span>Chave temporaria</span><strong>{pairing.code}</strong><small>Expira em poucos minutos.</small></div>}
      {copyStatus && <p className="copy-status">{copyStatus}</p>}
    </div>
  );
}

function EcosystemPanel({ webOnline, desktopOnline, androidOnline }: {
  webOnline: boolean;
  desktopOnline: boolean;
  androidOnline: boolean;
}) {
  return (
    <div className="tab-panel ecosystem-tab">
      <PanelTitle icon={<Network size={18} />} title="Operar Multiplataforma" subtitle="Ecossistema Jarvis em integracao total" />
      <div className="ecosystem-map">
        <div className="ecosystem-hub">
          <Orbit size={44} />
          <strong>JARVIS</strong>
        </div>
        <PlatformNode className="node-web" icon={<Globe2 size={22} />} title="Web Control Center" copy="Gerencie tudo do navegador" online={webOnline} />
        <PlatformNode className="node-desktop" icon={<Monitor size={22} />} title="Desktop Agent" copy="Processo em segundo plano" online={desktopOnline} />
        <PlatformNode className="node-android" icon={<Smartphone size={22} />} title="Android App" copy="Seu assistente movel" online={androidOnline} />
      </div>
      <div className="workflow-grid">
        {[
          ["1. Instalar Agent no desktop", "Agent instalado como processo de segundo plano.", <Monitor size={20} />],
          ["2. APK baixado automaticamente", "O sistema prepara o Android para pareamento.", <Download size={20} />],
          ["3. Chave de vinculacao liberada", "Codigo temporario gerado no Web Control Center.", <KeyRound size={20} />],
          ["4. Inserir codigo no app Android", "Digite o codigo no app Jarvis.", <Smartphone size={20} />],
          ["5. Sincronizar aparelhos", "Web, Desktop e Android conectados.", <RefreshCw size={20} />],
          ["6. Liberar funcoes e permissoes", "Permissoes necessarias aprovadas com seguranca.", <Shield size={20} />]
        ].map(([title, copy, icon], index) => (
          <StepCard key={String(title)} index={index + 1} title={String(title)} copy={String(copy)} icon={icon as ReactNode} />
        ))}
      </div>
    </div>
  );
}

function HealthPanel({ health, devices }: { health: ServiceHealth | null; devices: Device[] }) {
  const onlineDevices = health?.devices.online ?? devices.filter((device) => device.status === "online").length;
  const totalDevices = health?.devices.total ?? devices.length;
  const syncPercent = totalDevices ? Math.round((onlineDevices / totalDevices) * 100) : 0;

  return (
    <div className="tab-panel">
      <PanelTitle icon={<Activity size={18} />} title="Health Service" subtitle="Monitoramento em tempo real das vinculacoes" />
      <div className="metric-grid">
        <Metric label="API" value={health?.api ?? "checking"} icon={<Server size={18} />} />
        <Metric label="Banco" value={health?.database ?? "checking"} icon={<HardDrive size={18} />} />
        <Metric label="Aparelhos" value={String(totalDevices)} icon={<TabletSmartphone size={18} />} />
        <Metric label="Online" value={String(onlineDevices)} icon={<Wifi size={18} />} />
        <Metric label="Pendentes" value={String(health?.confirmations.pending ?? 0)} icon={<AlertTriangle size={18} />} />
        <Metric label="Comandos 24h" value={String(health?.commands.total_today ?? 0)} icon={<Zap size={18} />} />
      </div>
      <section className="health-monitor">
        <div className="sync-ring" style={{ "--sync": `${syncPercent}%` } as CSSProperties}>
          <strong>{syncPercent}%</strong>
          <span>Sincronizado</span>
        </div>
        <div className="health-list">
          <HealthRow label="Online" status="Sincronizado" tone="good" />
          <HealthRow label="Permissoes concedidas" status="Ativo" tone="cyan" />
          <HealthRow label="Aguardando" status={totalDevices === 0 ? "Sem aparelhos" : "Monitorando"} tone="warning" />
          <HealthRow label="Erro" status="Nenhum bloqueio critico" tone="good" />
        </div>
      </section>
    </div>
  );
}

function AndroidMockupFlow({ code }: { code?: string }) {
  return (
    <section className="android-flow">
      <div className="flow-title"><span /> Fluxo de vinculacao Android <span /></div>
      <PhoneMockup step="1" title="Inserir codigo" heading="Digite seu codigo de vinculacao" body="Encontre seu codigo no Web Control Center" code={code ?? "7GK-298-XLB"} status="Vincular" />
      <FlowArrow />
      <PhoneMockup step="2" title="Sincronizando" heading="Conta vinculada com sucesso!" body="Sincronizando dispositivos..." status="Tudo certo!" success />
      <FlowArrow />
      <PhoneMockup step="3" title="Permissoes" heading="Permissoes necessarias" body="Para liberar todo o potencial do Jarvis, conceda os acessos abaixo." status="Conceder permissoes" shield />
    </section>
  );
}

function PhoneMockup({ step, title, heading, body, code, status, success, shield }: {
  step: string;
  title: string;
  heading: string;
  body: string;
  code?: string;
  status: string;
  success?: boolean;
  shield?: boolean;
}) {
  return (
    <div className="phone-stage">
      <span className="step-hex">{step}</span>
      <strong className="phone-stage-title">{title}</strong>
      <div className="phone-shell">
        <div className="phone-screen">
          <span className="phone-brand">JARVIS</span>
          <div className={success ? "phone-orb success" : shield ? "phone-orb shield" : "phone-orb"}>{success ? <CheckCircle2 size={30} /> : shield ? <Shield size={30} /> : <Sparkles size={28} />}</div>
          <h3>{heading}</h3>
          <p>{body}</p>
          {code && <div className="phone-code">{code.split("").map((char, index) => <span key={`${char}-${index}`}>{char}</span>)}</div>}
          {shield && (
            <div className="permission-list">
              <StatusPill label="Acessibilidade" value="On" tone="cyan" />
              <StatusPill label="Notificacoes" value="On" tone="cyan" />
              <StatusPill label="Midia" value="On" tone="cyan" />
            </div>
          )}
          <button className="phone-button" type="button">{status}</button>
        </div>
      </div>
    </div>
  );
}

function DeviceFlow({ webOnline, desktopOnline, androidOnline }: {
  webOnline: boolean;
  desktopOnline: boolean;
  androidOnline: boolean;
}) {
  return (
    <div className="device-flow">
      <DeviceNode icon={<Globe2 size={24} />} label="Web Control Center" online={webOnline} />
      <span className="connector-line" />
      <DeviceNode icon={<Monitor size={24} />} label="Desktop Agent" online={desktopOnline} />
      <span className="connector-line" />
      <DeviceNode icon={<Smartphone size={24} />} label="Android APK" online={androidOnline} />
    </div>
  );
}

function DeviceNode({ icon, label, online }: { icon: ReactNode; label: string; online: boolean }) {
  return (
    <div className={online ? "device-node online" : "device-node"}>
      {icon}
      <strong>{label}</strong>
      <span>{online ? "Online" : "Aguardando"}</span>
    </div>
  );
}

function StatusStrip({ desktopOnline, androidOnline, mobilePairing, desktopPairing }: {
  desktopOnline: boolean;
  androidOnline: boolean;
  mobilePairing: PairingCode | null;
  desktopPairing: PairingCode | null;
}) {
  const items = [
    ["Agent Desktop instalado", desktopOnline],
    ["APK baixado automaticamente", true],
    ["Chave de vinculacao liberada", Boolean(mobilePairing || desktopPairing)],
    ["Android sincronizado", androidOnline],
    ["Permissoes concedidas", androidOnline]
  ] as const;

  return (
    <div className="status-strip">
      {items.map(([label, active], index) => (
        <div className={active ? "status-tile active" : "status-tile"} key={label}>
          <span>{index + 1}</span>
          <CheckCircle2 size={16} />
          <strong>{label}</strong>
        </div>
      ))}
    </div>
  );
}

function DeviceCard({ device }: { device: Device }) {
  const icon = device.device_type === "web" ? <Globe2 size={20} /> : ["desktop", "notebook"].includes(device.device_type) ? <Monitor size={20} /> : <Smartphone size={20} />;
  const online = device.status === "online";
  return (
    <div className={online ? "device-card online" : "device-card"}>
      {icon}
      <strong>{device.friendly_name}</strong>
      <span>{device.device_type} | {device.platform}</span>
      <small>{online ? "Online" : device.status}</small>
    </div>
  );
}

function SignalCard({ label, icon, active, onClick }: { label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? "signal-card active" : "signal-card"} type="button" onClick={onClick}>
      {icon}
      <strong>{label}</strong>
      <span>{active ? "Ativo" : "Standby"}</span>
    </button>
  );
}

function PlatformNode({ className, icon, title, copy, online }: {
  className: string;
  icon: ReactNode;
  title: string;
  copy: string;
  online: boolean;
}) {
  return (
    <div className={`platform-node ${className} ${online ? "online" : ""}`}>
      {icon}
      <div>
        <strong>{title}</strong>
        <span>{copy}</span>
      </div>
    </div>
  );
}

function StepCard({ index, title, copy, icon }: { index: number; title: string; copy: string; icon: ReactNode }) {
  return (
    <div className="step-card" style={{ "--delay": `${index * 70}ms` } as CSSProperties}>
      <span className="step-number">{index}</span>
      {icon}
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HealthRow({ label, status, tone }: { label: string; status: string; tone: "good" | "cyan" | "warning" }) {
  return (
    <div className={`health-row ${tone}`}>
      <span className="status-dot online" />
      <strong>{label}</strong>
      <small>{status}</small>
      <i />
    </div>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: "good" | "cyan" | "warning" }) {
  return <span className={`status-pill ${tone}`}><small>{label}</small><strong>{value}</strong></span>;
}

function EmptyState({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
  );
}

function FlowArrow() {
  return <ChevronRight className="flow-arrow" size={28} aria-hidden="true" />;
}

function PanelTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="panel-title">
      <span>{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? "active" : ""}`} type="button" onClick={onClick}>{icon}<span>{label}</span></button>;
}

function PlatformBadge({ icon, label }: { icon: ReactNode; label: string }) {
  return <span className="platform-badge">{icon}{label}</span>;
}

function BrandMark() {
  return (
    <div className="brand-mark">
      <span className="brand-orbit"><CircleDot size={28} /></span>
      <strong>JARVIS</strong>
    </div>
  );
}

function FooterSignals() {
  return (
    <footer className="footer-signals holo-card">
      <SignalFooter icon={<Shield size={23} />} title="Seguranca de ponta a ponta" copy="Seus dados sempre protegidos" />
      <SignalFooter icon={<RefreshCw size={23} />} title="Sincronizacao em tempo real" copy="Informacoes atualizadas instantaneamente" />
      <SignalFooter icon={<Sparkles size={23} />} title="Inteligencia continua" copy="Aprendizado e adaptacao constantes" />
      <SignalFooter icon={<Lock size={23} />} title="Privacidade total" copy="Voce no controle de tudo" />
    </footer>
  );
}

function SignalFooter({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <div>
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
    </div>
  );
}

function AmbientField() {
  return (
    <div className="ambient-field" aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => <span key={index} style={{ "--i": index } as CSSProperties} />)}
    </div>
  );
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
