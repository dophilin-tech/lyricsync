import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 1. 為了讓 Appflow 產出檔案並封裝 APK，這行必須存在
  output: 'export', 

  // 2. 保留您原本為了 Firebase App Hosting 設置的 AI 套件清單
  serverExternalPackages: ['genkit', '@genkit-ai/google-genai', '@genkit-ai/core', '@genkit-ai/ai'],

  images: {
    unoptimized: true, // 手機 App 不支援 Next.js 預設的圖片優化
  },

  webpack: (config, { isServer }) => {
    // 3. 核心修正：當為手機端 (Client) 打包時，強制忽略所有 Node.js 專用模組
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        // 這些是導致報錯的關鍵，我們強制告訴 Webpack「找不到沒關係，不要報錯」
        net: false,
        dns: false,
        tls: false,
        fs: false,
        path: false,
        child_process: false,
        async_hooks: false,
        os: false,
        process: false,
        util: false,
        http2: false, // 針對 @grpc/grpc-js 的額外修正
      };
    }
    return config;
  },
};

export default nextConfig;