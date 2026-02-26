import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 為了支援 Server Actions (AI 聽寫功能)，我們不使用靜態導出 (output: 'export')
  // 這樣才能在 Firebase App Hosting 上正常運行後端邏輯
  serverExternalPackages: ['genkit', '@genkit-ai/google-genai', '@genkit-ai/core', '@genkit-ai/ai'],
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 在瀏覽器端打包時，強制忽略 Node.js 內建模組，防止 async_hooks 等報錯
      config.resolve.fallback = {
        ...config.resolve.fallback,
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
      };
    }
    return config;
  },
};

export default nextConfig;
