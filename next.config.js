/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ESLint 빌드 중 무시 (Netlify 대응)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // 성능 최적화
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
    reactRemoveProperties: true,
  },

  // 압축 활성화
  compress: true,

  // 이미지 최적화
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000,
  },

  // API body size limit (이미지 base64 전송 허용)
  serverRuntimeConfig: {
    bodySizeLimit: '4mb',
  },

  // 실험적 기능
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'zustand',
      'sonner',
      '@supabase/supabase-js',
      'react-markdown',
      'date-fns',
    ],
  },

  // HTTP/2 서버 푸시 힌트
  poweredByHeader: false,

  // 서버 컴포넌트 외부 패키지
  serverExternalPackages: ['@supabase/supabase-js'],

  // 웹팩 최적화
  webpack: (config, { dev, isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, 'src'),
    };

    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
      };
    }

    return config;
  },

  productionBrowserSourceMaps: false,

  async headers() {
    return [
      {
        // 정적 자산 장기 캐시 (JS/CSS/이미지)
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // 폰트 캐시
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // API 응답 캐시 방지 (항상 최신)
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://js.toss.im",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.perplexity.ai https://generativelanguage.googleapis.com https://*.supabase.co wss://*.supabase.co https://*.nsvcs.net",
              "frame-src 'self' https://www.google.com https://js.toss.im",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
        ],
      },
    ];
  },

  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
};

module.exports = nextConfig;
