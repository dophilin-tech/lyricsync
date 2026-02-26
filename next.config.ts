import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 1. 關鍵：為了打包 APK，必須啟用靜態導出
  output: 'export', 
  
  // 2. 保留你原本針對 Firebase App Hosting 的設定
  serverExternalPackages: ['genkit', '@genkit-ai/google-genai', '@genkit-ai/core', '@genkit-ai/ai'],
  
  images: {
    unoptimized: true, // 手機 App 不支援 Next.js 預設的圖片優化
  },
  
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 3. 核心修正：在為手機端打包時，強制忽略所有 Node.js 零件
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
        http2: false, // 針對 @grpc/grpc-js 的額外修正
      };
    }
    return config;
  },
};

export default nextConfig;