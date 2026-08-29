import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voiceguard.sih',
  appName: 'VoiceGuard SIH',
  webDir: 'public',
  server: {
    url: 'https://voiceguard-sih.vercel.app',
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
