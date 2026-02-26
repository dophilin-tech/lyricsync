import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 關鍵 1：為了打包 APK，必須保留這個設定
  output: 'export', 
  
  // 關鍵 2：原本針對 Firebase 的設定可以保留，不影響打包
  serverExternalPackages: ['genkit', '@genkit-ai/google-genai', '@genkit-ai/core', '@genkit-ai/ai'],
  
  images: {
    unoptimized: true,
  },
  
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 關鍵 3：強化你的 Webpack fallback，把所有 Node.js 零件都擋住
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        dns: false,
        tls: false,
        fs: false,
        path: false,
        child_process: false,
        async_hooks: false, // 你原本代碼中有的
        os: false,
        process: false,
        util: false,
      };
    }
    return config;
  },
};

export default nextConfig;