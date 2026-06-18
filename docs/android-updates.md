# Jarvis BR Android updates

## Link fixo do APK

Recomendacao para producao: hospedar o APK em um bucket/objeto com URL direta e estavel, por exemplo:

```text
https://downloads.jarvisbr.com/android/jarvisbr-latest.apk
```

Boas opcoes:

- Cloudflare R2 com dominio proprio: melhor para URL fixa, cache, TLS e troca do arquivo sem mudar o link.
- GitHub Releases: simples e barato para publico interno, usando um asset com nome fixo por release.
- Supabase Storage ou S3: bom quando o projeto ja usa esse provedor.

Evite Google Drive como URL principal do APK. Ele pode mostrar tela intermediaria, exigir cookie, bloquear por limite/antivirus e mudar o comportamento de download direto.

No Render da API, configure:

```text
ANDROID_APK_URL=https://downloads.jarvisbr.com/android/jarvisbr-latest.apk
```

O link temporario do EAS serve para teste, mas expira.

## OTA no app Expo

O APK agora usa `expo-updates` no canal `preview`. Depois de instalar uma versao que ja contenha `expo-updates`, atualizacoes de JavaScript, telas, textos, estilos e assets podem chegar dentro do app sem desinstalar.

Publicar update OTA:

```bash
cd apps/mobile
eas update --channel preview --message "descricao da alteracao"
```

Quando gerar um APK novo:

```bash
cd apps/mobile
eas build -p android --profile preview
```

Ainda precisa de APK novo quando mudar codigo nativo, permissoes Android, Expo SDK, dependencias nativas ou `app.json` nativo. Para esses casos, incremente `android.versionCode`, gere outro APK e substitua o arquivo no link fixo.
