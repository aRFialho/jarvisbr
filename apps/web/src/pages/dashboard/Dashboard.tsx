import { useEffect, useMemo, useState } from "react";
import { Download, Link2, LogOut, Mic, RefreshCw, Send, Shield } from "lucide-react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { HoloAvatar } from "../../components/HoloAvatar";
import { type Confirmation, type Device, type FileResult, type HoloState, jarvisApi } from "../../lib/api";

const sampleCommand = "Jarvis, no computador Casa tem uma imagem chamada logo azul. Baixe ela para mim.";

export function Dashboard() {
  const [isAuthed, setIsAuthed] = useState(jarvisApi.authenticated);
  const [email, setEmail] = useState("alan@example.com");
  const [password, setPassword] = useState("jarvis-demo-123");
  const [name, setName] = useState("Alan");
  const [devices, setDevices] = useState<Device[]>([]);
  const [command, setCommand] = useState(sampleCommand);
  const [commandId, setCommandId] = useState("");
  const [results, setResults] = useState<FileResult[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileResult | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [phrase, setPhrase] = useState("");
  const [holoState, setHoloState] = useState<HoloState>("idle");
  const [message, setMessage] = useState("Toque no microfone ou digite um comando. Eu sempre vou pedir confirmacao antes de agir.");

  const casaOnline = useMemo(() => devices.some((device) => device.friendly_name.toLowerCase() === "casa"), [devices]);

  useEffect(() => {
    if (isAuthed) {
      refreshDevices().catch(showError);
    }
  }, [isAuthed]);

  async function refreshDevices() {
    const data = await jarvisApi.devices();
    setDevices(data.devices);
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
      setMessage("Conta conectada. Agora pareie o computador Casa ou execute o fluxo de busca.");
      setHoloState("idle");
    } catch (error) {
      showError(error);
    }
  }

  async function pairCasa() {
    try {
      setHoloState("thinking");
      setMessage("Gerando codigo temporario e pareando o computador Casa como aparelho proprio autorizado.");
      await jarvisApi.pairMockCasa();
      await refreshDevices();
      setHoloState("done");
      setMessage("Computador Casa vinculado com permissao segura para busca e download confirmado.");
    } catch (error) {
      showError(error);
    }
  }

  async function runCommand() {
    try {
      setHoloState("listening");
      setMessage(command);
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
    } catch (error) {
      showError(error);
    }
  }

  async function confirmAction() {
    if (!confirmation) return;
    try {
      setHoloState("executing");
      setMessage("Confirmacao validada. Enviando token curto de execucao ao agent autorizado.");
      await jarvisApi.confirm(confirmation.id, phrase);
      setConfirmation(null);
      setHoloState("done");
      setMessage("Acao liberada com seguranca. Se o agent estiver online, ele inicia a transferencia agora.");
    } catch (error) {
      showError(error);
    }
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
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Jarvis BR</span>
          <h2>Console holografico seguro</h2>
        </div>
        <div className="toolbar">
          <button className="icon-button" type="button" onClick={refreshDevices} aria-label="Atualizar aparelhos"><RefreshCw size={18} /></button>
          <button className="icon-button" type="button" onClick={() => { jarvisApi.logout(); setIsAuthed(false); }} aria-label="Sair"><LogOut size={18} /></button>
        </div>
      </header>

      <section className="main-grid">
        <HoloAvatar state={holoState} assistantName="Jarvis" transcript={message} audioLevel={holoState === "listening" ? 0.84 : 0.42} />

        <section className="control-deck">
          <div className="device-strip">
            {devices.map((device) => (
              <span className="device-pill" key={device.id}>
                <Shield size={14} /> {device.friendly_name} <small>{device.status}</small>
              </span>
            ))}
            {!casaOnline && (
              <button className="ghost-button compact" type="button" onClick={pairCasa}>
                <Link2 size={16} /> Parear Casa
              </button>
            )}
          </div>

          <div className="command-row">
            <button className="orb-button" type="button" aria-label="Capturar voz" onClick={() => setHoloState("listening")}>
              <Mic size={22} />
            </button>
            <textarea value={command} onChange={(event) => setCommand(event.target.value)} />
            <button className="primary-button send-button" type="button" onClick={runCommand}>
              <Send size={18} /> Enviar
            </button>
          </div>

          <div className="results-grid">
            {results.map((file, index) => (
              <button
                className={`file-card ${selectedFile?.localFileId === file.localFileId ? "selected" : ""}`}
                type="button"
                key={file.localFileId}
                onClick={() => chooseFile(file)}
              >
                <span className="thumb">{file.fileKind === "image" ? "IMG" : "DOC"}</span>
                <span className="rank">{index + 1}</span>
                <strong>{file.fileName}</strong>
                <small>{file.filePathHint}</small>
                <span>{formatBytes(file.fileSize)} · {new Date(file.modifiedAt).toLocaleDateString("pt-BR")} · {Math.round(file.score * 100)}%</span>
                <Download size={18} />
              </button>
            ))}
          </div>
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
