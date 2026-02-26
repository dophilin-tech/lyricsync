import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 移除 output: 'export' 以支援 Server Actions (AI 功能所需)
  // 如果需要打包 APK，建議在部署到 Firebase 後將 Capacitor 指向正式網址
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placeholder.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // 強制將 Genkit 相關套件留在伺服器端處理
  serverComponentsExternalPackages: ['genkit', '@genkit-ai/core', '@genkit-ai/google-genai'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 在客戶端打包時，將 Node.js 內建模組導向空對象，避免編譯錯誤
      config.resolve.fallback = {
        ...config.resolve.fallback,
        async_hooks: false,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        vm: false,
      };
    }
    return config;
  },
};

export default nextConfig;