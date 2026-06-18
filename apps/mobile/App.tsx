import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import * as Updates from "expo-updates";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";

type Stage = "code" | "success" | "permissions" | "chat";
type HoloState = "idle" | "thinking" | "done" | "error";
type Permissions = {
  accessibility: boolean;
  notifications: boolean;
  media: boolean;
  background: boolean;
};

const apiUrl = "https://jarvis-api-n9wv.onrender.com";

export default function App() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 720;
  const [stage, setStage] = useState<Stage>("code");
  const [holoState, setHoloState] = useState<HoloState>("idle");
  const [code, setCode] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [message, setMessage] = useState("Encontre seu codigo no Web Control Center.");
  const [updateStatus, setUpdateStatus] = useState("Sistema atualizado.");
  const [isUpdating, setIsUpdating] = useState(false);
  const [permissions, setPermissions] = useState({
    accessibility: true,
    notifications: true,
    media: true,
    background: true
  });

  useEffect(() => {
    void checkForUpdates(false);
  }, []);

  async function checkForUpdates(manual = true) {
    if (!Updates.isEnabled) {
      const unavailableMessage = "Atualizacoes OTA ficam ativas no APK gerado pelo EAS.";
      setUpdateStatus(unavailableMessage);
      if (manual) {
        Alert.alert("Atualizacao Jarvis", unavailableMessage);
      }
      return;
    }

    setIsUpdating(true);
    setUpdateStatus("Verificando atualizacoes...");

    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) {
        setUpdateStatus("Sistema atualizado.");
        if (manual) {
          Alert.alert("Jarvis atualizado", "Nenhuma atualizacao disponivel agora.");
        }
        return;
      }

      setUpdateStatus("Baixando pacote OTA...");
      await Updates.fetchUpdateAsync();
      setUpdateStatus("Atualizacao pronta para aplicar.");
      Alert.alert("Atualizacao baixada", "Reinicie o app para aplicar a nova versao agora.", [
        { text: "Depois", style: "cancel" },
        { text: "Reiniciar", onPress: () => void Updates.reloadAsync() }
      ]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Nao foi possivel verificar atualizacoes.";
      setUpdateStatus(errorMessage);
      if (manual) {
        Alert.alert("Atualizacao indisponivel", errorMessage);
      }
    } finally {
      setIsUpdating(false);
    }
  }

  async function pairDevice() {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      setHoloState("error");
      setMessage("Digite o codigo de vinculacao gerado no painel web.");
      return;
    }

    setHoloState("thinking");
    setMessage("Validando codigo e sincronizando dispositivos.");

    try {
      const response = await fetch(`${apiUrl}/devices/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalizedCode,
          friendlyName: "Android Jarvis",
          deviceType: "mobile",
          platform: "Android",
          publicKey: `expo-android-${Date.now()}`
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Codigo invalido ou expirado.");
      }

      setDeviceToken(String(data.token ?? ""));
      setStage("success");
      setHoloState("done");
      setMessage("Conta vinculada com sucesso. Sincronizacao pronta.");
    } catch (error) {
      setHoloState("error");
      setMessage(error instanceof Error ? error.message : "Falha ao vincular dispositivo.");
    }
  }

  const shell = (
    <PhoneSurface>
      {stage === "code" && (
        <CodeStage code={code} setCode={setCode} state={holoState} message={message} onPair={pairDevice} />
      )}
      {stage === "success" && <SuccessStage onContinue={() => setStage("permissions")} />}
      {stage === "permissions" && (
        <PermissionsStage
          permissions={permissions}
          setPermissions={setPermissions}
          onFinish={() => {
            if (!deviceToken) {
              Alert.alert("Vinculacao pendente", "Vincule a conta antes de entrar no chat.");
              setStage("code");
              return;
            }
            setStage("chat");
          }}
        />
      )}
      {stage === "chat" && (
        <ChatStage updateStatus={updateStatus} isUpdating={isUpdating} onCheckUpdate={() => checkForUpdates()} />
      )}
    </PhoneSurface>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={[styles.page, isTablet && styles.tabletPage]}>
        {isTablet && <TabletPanel stage={stage} holoState={holoState} message={message} />}
        <View style={styles.phoneColumn}>{shell}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PhoneSurface({ children }: { children: ReactNode }) {
  return (
    <View style={styles.phoneShell}>
      <View style={styles.phoneScreen}>
        <DigitalGrid />
        <View style={styles.notch} />
        {children}
      </View>
    </View>
  );
}

function StageShell({
  step,
  status,
  title,
  subtitle,
  icon,
  tone = "cyan",
  children
}: {
  step: string;
  status: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "cyan" | "green" | "amber" | "red";
  children: ReactNode;
}) {
  const color = toneColor(tone);
  return (
    <View style={styles.stage}>
      <View style={styles.phoneHeader}>
        <Text style={styles.phoneBrand}>JARVIS</Text>
        <Ionicons name="sparkles" color="rgba(37,244,255,0.72)" size={18} />
      </View>
      <View style={styles.stepRow}>
        <View style={[styles.stepHex, { borderColor: color }]}>
          <Text style={styles.stepText}>{step}</Text>
        </View>
        <Text style={styles.stepLabel}>{status.toUpperCase()}</Text>
      </View>
      <View style={styles.orbWrap}>
        <View style={[styles.orbOuter, { borderColor: color, shadowColor: color }]}>
          <View style={[styles.orbInner, { borderColor: color, backgroundColor: `${color}18` }]}>
            <Ionicons name={icon} color={color} size={36} />
          </View>
        </View>
      </View>
      <Text style={styles.stageTitle}>{title}</Text>
      <Text style={styles.stageSubtitle}>{subtitle}</Text>
      <View style={styles.stageChildren}>{children}</View>
    </View>
  );
}

function CodeStage({
  code,
  setCode,
  state,
  message,
  onPair
}: {
  code: string;
  setCode: (value: string) => void;
  state: HoloState;
  message: string;
  onPair: () => void;
}) {
  return (
    <StageShell
      step="1"
      status={state === "error" ? "Codigo bloqueado" : "Inserir codigo"}
      icon="sparkles"
      tone={state === "error" ? "red" : state === "thinking" ? "amber" : "cyan"}
      title="Digite seu codigo de vinculacao"
      subtitle={message}
    >
      <TextInput
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        placeholder="7GK-298-XLB"
        placeholderTextColor="#5F7F95"
        style={styles.codeInput}
      />
      <PrimaryButton label={state === "thinking" ? "Sincronizando..." : "Vincular"} icon="link" onPress={onPair} loading={state === "thinking"} />
      <Text style={styles.miniLink}>Como funciona?</Text>
    </StageShell>
  );
}

function SuccessStage({ onContinue }: { onContinue: () => void }) {
  return (
    <StageShell
      step="2"
      status="Sincronizando"
      icon="checkmark"
      tone="green"
      title="Conta vinculada com sucesso!"
      subtitle="Sincronizando dispositivos..."
    >
      <SyncCard icon="globe-outline" title="Web Control Center" status="Conectado" />
      <SyncCard icon="desktop-outline" title="Desktop Agent" status="Conectado" />
      <SyncCard icon="phone-portrait-outline" title="Android Dispositivo" status="Sincronizado" />
      <PrimaryButton label="Continuar" icon="arrow-forward" onPress={onContinue} />
      <View style={styles.successLine}>
        <Ionicons name="checkmark-circle-outline" color="#3DFF9C" size={18} />
        <Text style={styles.successText}>Tudo certo!</Text>
      </View>
    </StageShell>
  );
}

function PermissionsStage({
  permissions,
  setPermissions,
  onFinish
}: {
  permissions: Permissions;
  setPermissions: (permissions: Permissions) => void;
  onFinish: () => void;
}) {
  return (
    <StageShell
      step="3"
      status="Permissoes"
      icon="lock-closed-outline"
      tone="cyan"
      title="Permissoes necessarias"
      subtitle="Para liberar todo o potencial do Jarvis, conceda os acessos abaixo."
    >
      <PermissionTile icon="accessibility-outline" title="Acessibilidade" copy="Permite automacoes inteligentes" value={permissions.accessibility} onValueChange={(value) => setPermissions({ ...permissions, accessibility: value })} />
      <PermissionTile icon="notifications-outline" title="Notificacoes" copy="Receber alertas e comandos" value={permissions.notifications} onValueChange={(value) => setPermissions({ ...permissions, notifications: value })} />
      <PermissionTile icon="folder-open-outline" title="Midia e arquivos" copy="Mostrar arquivos autorizados" value={permissions.media} onValueChange={(value) => setPermissions({ ...permissions, media: value })} />
      <PermissionTile icon="shield-checkmark-outline" title="Uso em segundo plano" copy="Manter conexao segura" value={permissions.background} onValueChange={(value) => setPermissions({ ...permissions, background: value })} />
      <PrimaryButton label="Conceder permissoes" icon="shield-checkmark" onPress={onFinish} />
    </StageShell>
  );
}

function ChatStage({
  updateStatus,
  isUpdating,
  onCheckUpdate
}: {
  updateStatus: string;
  isUpdating: boolean;
  onCheckUpdate: () => void;
}) {
  return (
    <StageShell
      step="OK"
      status="Online"
      icon="chatbubbles-outline"
      tone="green"
      title="JARVIS ativo"
      subtitle="A vinculacao foi concluida e o dispositivo esta pronto para comandos seguros."
    >
      <View style={styles.chatCard}>
        <Text style={styles.chatEyebrow}>Canal seguro</Text>
        <Text style={styles.chatText}>Web, Desktop Agent e Android sincronizados.</Text>
      </View>
      <UpdatePanel status={updateStatus} isUpdating={isUpdating} onCheck={onCheckUpdate} />
    </StageShell>
  );
}

function UpdatePanel({
  status,
  isUpdating,
  onCheck
}: {
  status: string;
  isUpdating: boolean;
  onCheck: () => void;
}) {
  const channel = Updates.channel ?? "preview";
  const runtimeVersion = Updates.runtimeVersion ?? "0.1.1";
  const updateId = Updates.updateId ? Updates.updateId.slice(0, 8) : "embutido";

  return (
    <View style={styles.updateCard}>
      <View style={styles.updateHeader}>
        <Ionicons name="cloud-download-outline" color="#25F4FF" size={22} />
        <View style={styles.tileCopy}>
          <Text style={styles.updateTitle}>Atualizacao direta</Text>
          <Text style={styles.updateStatus}>{status}</Text>
        </View>
      </View>
      <View style={styles.updateMeta}>
        <Text style={styles.updatePill}>Canal {channel}</Text>
        <Text style={styles.updatePill}>Runtime {runtimeVersion}</Text>
        <Text style={styles.updatePill}>Build {updateId}</Text>
      </View>
      <PrimaryButton
        label={isUpdating ? "Verificando..." : "Atualizar app"}
        icon="refresh"
        onPress={onCheck}
        loading={isUpdating}
      />
    </View>
  );
}

function SyncCard({ icon, title, status }: { icon: keyof typeof Ionicons.glyphMap; title: string; status: string }) {
  return (
    <View style={styles.glassTile}>
      <Ionicons name={icon} color="#E5F6FF" size={23} />
      <View style={styles.tileCopy}>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileStatus}>{status}</Text>
      </View>
      <Ionicons name="checkmark-circle" color="#3DFF9C" size={18} />
    </View>
  );
}

function PermissionTile({
  icon,
  title,
  copy,
  value,
  onValueChange
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  copy: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.glassTile}>
      <Ionicons name={icon} color="#E5F6FF" size={23} />
      <View style={styles.tileCopy}>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileCopyText}>{copy}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} thumbColor={value ? "#25F4FF" : "#5F7F95"} trackColor={{ true: "#176CFF", false: "#1A2C3B" }} />
    </View>
  );
}

function PrimaryButton({
  label,
  icon,
  onPress,
  loading
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={onPress} disabled={loading}>
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name={icon} color="#FFFFFF" size={18} />}
      <Text style={styles.primaryButtonText}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

function TabletPanel({ stage, holoState, message }: { stage: Stage; holoState: HoloState; message: string }) {
  const steps = useMemo(
    () => [
      ["1. Inserir codigo", stage === "code", ["success", "permissions", "chat"].includes(stage)],
      ["2. Sincronizando", stage === "success", ["permissions", "chat"].includes(stage)],
      ["3. Permissoes", stage === "permissions", stage === "chat"]
    ] as const,
    [stage]
  );

  return (
    <View style={styles.tabletPanel}>
      <View style={styles.tabletHeader}>
        <View style={styles.tabletOrb}>
          <Ionicons name="sparkles" color="#25F4FF" size={25} />
        </View>
        <View style={styles.tabletTitleBlock}>
          <Text style={styles.tabletTitle}>JARVIS ANDROID APK</Text>
          <Text style={styles.tabletSubtitle}>Fluxo real responsivo para celular e tablet</Text>
        </View>
      </View>
      <View style={styles.tabletSteps}>
        {steps.map(([label, active, complete]) => (
          <View key={label} style={[styles.tabletStep, (active || complete) && styles.tabletStepActive]}>
            <Ionicons name={complete ? "checkmark-circle" : "radio-button-off-outline"} color={complete ? "#3DFF9C" : active ? "#25F4FF" : "#4E6B82"} size={22} />
            <Text style={[styles.tabletStepText, (active || complete) && styles.tabletStepTextActive]}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.tabletMessage}>
        <Text style={styles.tabletState}>{holoState.toUpperCase()}</Text>
        <Text style={styles.tabletMessageText}>{message}</Text>
      </View>
    </View>
  );
}

function DigitalGrid() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 18 }, (_, index) => <View key={`v-${index}`} style={[styles.gridLineV, { left: `${index * 6}%` }]} />)}
      {Array.from({ length: 24 }, (_, index) => <View key={`h-${index}`} style={[styles.gridLineH, { top: `${index * 5}%` }]} />)}
      {Array.from({ length: 32 }, (_, index) => (
        <View
          key={`p-${index}`}
          style={[
            styles.particle,
            {
              left: `${(index * 31) % 100}%`,
              top: `${(index * 47) % 100}%`,
              opacity: index % 3 === 0 ? 0.6 : 0.28
            }
          ]}
        />
      ))}
    </View>
  );
}

function toneColor(tone: "cyan" | "green" | "amber" | "red") {
  if (tone === "green") return "#3DFF9C";
  if (tone === "amber") return "#F9C857";
  if (tone === "red") return "#FF5C72";
  return "#25F4FF";
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#02050A"
  },
  page: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: "#02050A"
  },
  tabletPage: {
    flexDirection: "row",
    gap: 24,
    padding: 24
  },
  phoneColumn: {
    width: "100%",
    maxWidth: 420
  },
  phoneShell: {
    borderRadius: 34,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    backgroundColor: "#111923",
    padding: 8,
    shadowColor: "#25F4FF",
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 20
  },
  phoneScreen: {
    minHeight: 700,
    overflow: "hidden",
    borderRadius: 27,
    backgroundColor: "#061521"
  },
  notch: {
    position: "absolute",
    top: 0,
    left: "31%",
    right: "31%",
    height: 24,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: "#02050A"
  },
  stage: {
    paddingTop: 28,
    paddingHorizontal: 18,
    paddingBottom: 18,
    alignItems: "center"
  },
  phoneHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 80
  },
  phoneBrand: {
    color: "#E5F6FF",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 2.2
  },
  stepRow: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12
  },
  stepHex: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 23,
    borderWidth: 1
  },
  stepText: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
  stepLabel: {
    color: "#BDEEFF",
    fontWeight: "900"
  },
  orbWrap: {
    marginTop: 20,
    marginBottom: 24
  },
  orbOuter: {
    width: 134,
    height: 134,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 67,
    borderWidth: 1,
    shadowOpacity: 0.9,
    shadowRadius: 24
  },
  orbInner: {
    width: 82,
    height: 82,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 41,
    borderWidth: 1
  },
  stageTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 26,
    textAlign: "center"
  },
  stageSubtitle: {
    marginTop: 10,
    color: "#9DB7C9",
    fontSize: 14,
    lineHeight: 18,
    textAlign: "center"
  },
  stageChildren: {
    width: "100%",
    marginTop: 22,
    gap: 11
  },
  codeInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "rgba(37,244,255,0.45)",
    borderRadius: 12,
    backgroundColor: "rgba(2,10,18,0.58)",
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 2.8,
    paddingHorizontal: 14,
    textAlign: "center"
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: "#176CFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#25F4FF",
    shadowOpacity: 0.36,
    shadowRadius: 24
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: 0.6
  },
  pressed: {
    opacity: 0.86,
    transform: [{ translateY: 1 }]
  },
  miniLink: {
    color: "#88CFFF",
    fontSize: 13,
    textAlign: "center"
  },
  glassTile: {
    width: "100%",
    minHeight: 60,
    borderWidth: 1,
    borderColor: "rgba(37,244,255,0.22)",
    borderRadius: 12,
    backgroundColor: "rgba(6,18,32,0.45)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12
  },
  tileCopy: {
    flex: 1
  },
  tileTitle: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
  tileStatus: {
    color: "#3DFF9C",
    fontSize: 12
  },
  tileCopyText: {
    color: "#9DB7C9",
    fontSize: 12
  },
  successLine: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7
  },
  successText: {
    color: "#3DFF9C",
    fontWeight: "900"
  },
  chatCard: {
    borderWidth: 1,
    borderColor: "rgba(61,255,156,0.32)",
    borderRadius: 12,
    backgroundColor: "rgba(61,255,156,0.08)",
    padding: 14
  },
  chatEyebrow: {
    color: "#3DFF9C",
    fontWeight: "900",
    textTransform: "uppercase"
  },
  chatText: {
    color: "#CDEFFF",
    marginTop: 6
  },
  updateCard: {
    borderWidth: 1,
    borderColor: "rgba(37,244,255,0.32)",
    borderRadius: 12,
    backgroundColor: "rgba(37,244,255,0.07)",
    padding: 14,
    gap: 12
  },
  updateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  updateTitle: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
  updateStatus: {
    color: "#9DB7C9",
    fontSize: 12,
    marginTop: 2
  },
  updateMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  updatePill: {
    borderWidth: 1,
    borderColor: "rgba(37,244,255,0.24)",
    borderRadius: 999,
    color: "#BDEEFF",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "rgba(2,10,18,0.45)"
  },
  tabletPanel: {
    flex: 1,
    minHeight: 560,
    borderWidth: 1,
    borderColor: "rgba(37,244,255,0.35)",
    borderRadius: 18,
    backgroundColor: "rgba(7,26,43,0.72)",
    padding: 24
  },
  tabletHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  tabletOrb: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#25F4FF",
    borderRadius: 26
  },
  tabletTitleBlock: {
    flex: 1
  },
  tabletTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1.1
  },
  tabletSubtitle: {
    color: "#9DB7C9"
  },
  tabletSteps: {
    marginTop: 28,
    gap: 12
  },
  tabletStep: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: "rgba(78,107,130,0.48)",
    borderRadius: 12,
    backgroundColor: "rgba(78,107,130,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14
  },
  tabletStepActive: {
    borderColor: "rgba(37,244,255,0.48)",
    backgroundColor: "rgba(37,244,255,0.08)"
  },
  tabletStepText: {
    color: "#9DB7C9",
    fontWeight: "900"
  },
  tabletStepTextActive: {
    color: "#FFFFFF"
  },
  tabletMessage: {
    marginTop: "auto"
  },
  tabletState: {
    color: "#25F4FF",
    fontWeight: "900"
  },
  tabletMessageText: {
    color: "#CDEFFF",
    fontSize: 18,
    lineHeight: 23,
    marginTop: 8
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(37,244,255,0.06)"
  },
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(37,244,255,0.06)"
  },
  particle: {
    position: "absolute",
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#25F4FF"
  }
});
