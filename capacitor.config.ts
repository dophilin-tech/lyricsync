
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lyricsync.app',
  appName: 'LyricSync',
  webDir: 'out',
  server: {
    // 這裡應填入您部署後的 Firebase App Hosting 網址，以便在手機上使用 AI 功能
    url: 'https://your-firebase-app-url.web.app',
    allowNavigation: ['your-firebase-app-url.web.app']
  }
};

export default config;
