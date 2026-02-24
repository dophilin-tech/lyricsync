
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lyricsync.app',
  appName: 'LyricSync',
  webDir: 'out',
  server: {
    // 當您部署到 Firebase 後，請將此處替換為您的正式網址，以便在 APK 中正常使用 AI 功能
    androidScheme: 'https',
    allowNavigation: ['*']
  }
};

export default config;
