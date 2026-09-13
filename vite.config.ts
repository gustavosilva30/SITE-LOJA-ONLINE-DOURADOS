import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

/** Evita `http://api...` embutido no bundle (mixed content em páginas https://www...). */
function normalizeViteApiUrl(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  const trimmed = url.trim().replace(/\/$/, '');
  try {
    const hasScheme = /^https?:\/\//i.test(trimmed);
    const u = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    const h = u.hostname.toLowerCase();
    const isLocal = h === 'localhost' || h === '127.0.0.1' || h.startsWith('127.');
    if (u.protocol === 'http:' && !isLocal) {
      u.protocol = 'https:';
      return u.toString().replace(/\/$/, '');
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawApiUrl = env.VITE_API_URL ?? process.env.VITE_API_URL;
  const viteApiUrl =
    rawApiUrl !== undefined && String(rawApiUrl).trim() !== ''
      ? normalizeViteApiUrl(String(rawApiUrl))
      : undefined;

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // Estratégia: app shell cacheado + assets hashados imutáveis.
        // Mutações (POST/PUT/DELETE) e dados em tempo real (WS) NÃO passam pelo SW.
        injectRegister: 'auto',
        manifest: {
          name: 'CRM Dourados Auto Peças',
          short_name: 'CRM Dourados',
          description: 'Sistema de gestão de estoque, vendas e WhatsApp.',
          theme_color: '#0ea5e9',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          orientation: 'any',
          icons: [
            { src: '/crm-icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/crm-icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          // App shell — index.html via Network-first com fallback offline ao cache.
          // Garante que update do app é sempre detectado mas funciona offline.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [
            /^\/api\//,         // backend nunca passa pelo SW
            /^\/ws\//,          // WebSockets
            /^\/admin\/store/,  // admin da loja
            /^\/checkout/,      // checkout (sensível)
          ],
          // Pula JS/CSS hashado no precache pra evitar precachear chunks lazy
          // (são baixados sob demanda + cacheados por runtime caching abaixo).
          globPatterns: ['index.html', 'manifest.webmanifest', 'favicon.ico'],
          runtimeCaching: [
            // Assets gerados pelo Vite (com hash no nome) — cache-first eterno
            {
              urlPattern: /\/assets\/.*\.(js|css|woff2?)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'crm-static-assets',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            // Fontes Google
            {
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // Imagens MinIO (thumbs e originais) — StaleWhileRevalidate para abertura instantânea do cache
            {
              urlPattern: /^https:\/\/minio\.[^/]+\/produtos\/.*/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'crm-product-images',
                expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 14 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
          // Limpa caches antigos automaticamente quando atualiza
          cleanupOutdatedCaches: true,
          // Atualiza imediatamente e assume o controle sem travar em versão obsoleta
          skipWaiting: true,
          clientsClaim: true,
        },
        devOptions: {
          enabled: false, // Não roda em dev — evita confusão com HMR
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      ...(viteApiUrl !== undefined
        ? {'import.meta.env.VITE_API_URL': JSON.stringify(viteApiUrl)}
        : {}),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    optimizeDeps: {
      include: ['fabric'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/proxy': {
          target: 'https://api.douradosap.com.br',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/proxy/, ''),
          configure: (proxy, _options) => {
            proxy.on('proxyRes', (proxyRes) => {
              const statusCode = proxyRes.statusCode || 200;
              if ([301, 302, 307, 308].includes(statusCode) && proxyRes.headers.location) {
                proxyRes.headers.location = proxyRes.headers.location.replace('https://api.douradosap.com.br', '/proxy');
              }
            });
          }
        }
      }
    },
    build: {
      target: 'es2022',
      cssCodeSplit: true,
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'radix': [
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
              '@radix-ui/react-tooltip',
              '@radix-ui/react-checkbox',
              '@radix-ui/react-switch',
              '@radix-ui/react-label',
              '@radix-ui/react-slot',
            ],
            'ui-extras': ['lucide-react', 'framer-motion', 'sonner'],
            'charts': ['recharts'],
            'pdf': ['jspdf', 'jspdf-autotable', '@react-pdf/renderer'],
            'xlsx-vendor': ['xlsx'],
            'fabric-vendor': ['fabric'],
            'qr': ['html5-qrcode'],
          },
        },
      },
    },
  };
});
