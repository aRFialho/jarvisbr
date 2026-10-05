# Jarvis BR

Assistente pessoal **local-first para Windows**, acionado por palmas e voz.

A proposta desta versão é simples: o computador fica escutando um gatilho acústico leve; quando reconhece a sequência, abre uma interação de voz e usa ferramentas locais com uma camada explícita de segurança.

## Gestos

| Gatilho | Ação |
|---|---|
| 👏👏 | Conversa / pergunta normal |
| 👏👏👏 | Modo agente com planejamento de ferramentas |
| `Ctrl + Alt + J` | Atalho de conversa |

No modo conversa, comandos simples são resolvidos localmente. Perguntas abertas seguem para o provider configurado.

No modo agente, o modelo devolve um plano JSON de ferramentas. **O modelo nunca chama o sistema operacional diretamente**: cada ação passa por allowlist, validação de caminho e política de risco antes de executar.

## Arquitetura

```text
Microfone
   │
   ├── detector de palmas ── 2 palmas ── conversa
   │                       └─ 3 palmas ── agente
   │
   └── Whisper local (STT)
             │
             v
        Dispatcher
        ├── comandos locais
        └── provider de IA
             ├── OpenJarvis local
             ├── Ollama local
             ├── Gemini
             └── Offline
                  │
                  v
              Planner
                  │
                  v
          SecurityPolicy
          ├── low risk: executa
          ├── high risk: exige "Confirmo"
          └── bloqueado: não executa
                  │
                  v
            WindowsTools
```

## O que já funciona

- Detecção de **duas e três palmas** com pico, RMS, crest factor, cadência e cooldown.
- Reconhecimento de voz local com `faster-whisper`.
- Resposta falada usando SAPI5/`pyttsx3`.
- HUD flutuante simples e sempre no topo.
- Atalho global `Ctrl+Alt+J` usando a API nativa do Windows.
- Memória de conversas em SQLite local.
- Provider automático: `OpenJarvis -> Ollama -> Gemini -> offline`.
- Comandos locais de hora, abrir app/site, volume e screenshot.
- Modo agente com ações estruturadas.
- Leitura/escrita de arquivos limitada às pastas configuradas.
- Shell **desligado por padrão**; quando ligado, ainda exige confirmação e allowlist.
- Inicialização automática no Windows via `Startup`.
- Testes de detector de palmas, segurança e roteamento.

## Instalação no Windows

Requisitos:

- Windows 10/11
- Python 3.11, 3.12 ou 3.13
- Microfone

Clone o repositório e execute:

```powershell
git clone https://github.com/aRFialho/jarvisbr.git
cd jarvisbr
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -InstallOllama -PullModel
```

O instalador:

1. cria `.venv`;
2. instala Jarvis BR + Whisper;
3. cria `.env` a partir do exemplo;
4. detecta a RAM e sugere Qwen 3.5;
5. opcionalmente instala Ollama e baixa o modelo;
6. coloca o Jarvis na inicialização do Windows.

Depois rode:

```powershell
.\.venv\Scripts\jarvisbr.exe doctor
.\.venv\Scripts\jarvisbr.exe start
```

## Provider de IA

Em `.env`:

```env
JARVIS_PROVIDER=auto
```

`auto` tenta nesta ordem:

1. OpenJarvis em `http://127.0.0.1:8000/v1`;
2. Ollama em `http://127.0.0.1:11434`;
3. Gemini se houver `GEMINI_API_KEY`;
4. modo offline.

### OpenJarvis

Se o OpenJarvis estiver rodando localmente com servidor compatível OpenAI, Jarvis BR usa esse endpoint como cérebro:

```env
JARVIS_PROVIDER=openjarvis
JARVIS_OPENJARVIS_URL=http://127.0.0.1:8000/v1
JARVIS_OPENJARVIS_MODEL=qwen3.5:4b
```

### Ollama

```env
JARVIS_PROVIDER=ollama
JARVIS_OLLAMA_MODEL=qwen3.5:4b
```

### Gemini

```env
JARVIS_PROVIDER=gemini
GEMINI_API_KEY=sua-chave
JARVIS_GEMINI_MODEL=gemini-2.5-flash
```

## Segurança

Ferramentas de baixo risco podem rodar diretamente:

- `open_app`
- `open_url`
- `volume`
- `screenshot`
- `read_file` dentro das pastas permitidas

Ferramentas de alto risco exigem confirmação falada **"Confirmo"**:

- `write_file`
- `run_shell`

O shell ainda vem desabilitado:

```env
JARVIS_ALLOW_SHELL=false
```

Para habilitar, é necessário também manter os executáveis desejados na allowlist:

```env
JARVIS_ALLOW_SHELL=true
JARVIS_SHELL_ALLOWLIST=python;python.exe;py;git;node;npm;pnpm;uv;ollama
```

Mesmo no modo agente, ferramentas desconhecidas são rejeitadas.

## Pastas permitidas

Por padrão:

```env
JARVIS_ALLOWED_DIRS=%USERPROFILE%\Documents;%USERPROFILE%\Downloads;%USERPROFILE%\Desktop
```

Leitura ou escrita fora dessas raízes é bloqueada.

## Apps permitidos

```env
JARVIS_APPS=chrome=chrome.exe;edge=msedge.exe;notepad=notepad.exe;calculadora=calc.exe;explorador=explorer.exe;vscode=code;spotify=spotify.exe
```

Exemplo:

> "Abra o Chrome"

O dispatcher não entrega esse pedido ao LLM. Ele resolve localmente e usa apenas a entrada allowlisted.

## Ajuste das palmas

Os principais parâmetros ficam no `.env`:

```env
JARVIS_CLAP_THRESHOLD=0.24
JARVIS_CLAP_SPIKE_RATIO=3.5
JARVIS_CLAP_MAX_RMS=0.18
JARVIS_CLAP_MIN_GAP=0.12
JARVIS_CLAP_MAX_GAP=0.95
JARVIS_CLAP_SETTLE=0.55
```

Se sons comuns estiverem ativando o Jarvis, aumente `JARVIS_CLAP_THRESHOLD` ou `JARVIS_CLAP_SPIKE_RATIO`.

Se suas palmas não forem reconhecidas, reduza `JARVIS_CLAP_THRESHOLD` aos poucos, por exemplo para `0.20`.

## Teste sem microfone

```powershell
.\.venv\Scripts\jarvisbr.exe text "que horas são?"
.\.venv\Scripts\jarvisbr.exe text --agent "abra o chrome"
```

## Desenvolvimento

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev,voice]"
pytest -q
python -m compileall -q src
```

## Direção do projeto

A versão anterior do repositório misturava API cloud, Postgres, dashboard web, mobile e agent remoto. A reconstrução atual reduz deliberadamente o escopo para tornar o núcleo Windows realmente utilizável primeiro.

Próximas evoluções naturais:

- voiceprint opcional do proprietário;
- wake word offline além das palmas;
- tray icon;
- integrações Spotify/Calendar/e-mail;
- habilidades plugáveis;
- automações agendadas via OpenJarvis;
- instalador `.exe`.

## Referências de design

A detecção de palmas e a experiência Windows foram estudadas em projetos públicos como `rsg28/jarvis`; o projeto OpenJarvis é suportado como backend opcional por API. Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
