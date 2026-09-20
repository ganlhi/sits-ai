import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const ICONS = ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

/**
 * Base URL the app is served from. GitHub Pages serves a project site under /<repo>/, so the
 * deploy workflow sets BASE_PATH; local dev and preview use '/'.
 */
const BASE = process.env.BASE_PATH ?? '/';

/**
 * Emit the PWA icons as build assets instead of using `public/`: Google Drive drops a phantom
 * `desktop.ini` into every folder it manages, and Vite's copy of `public/` fails on it.
 */
function pwaIcons(): Plugin {
  return {
    name: 'sits:pwa-icons',
    apply: 'build',
    generateBundle() {
      for (const name of ICONS) {
        this.emitFile({ type: 'asset', fileName: name, source: readFileSync(resolve(__dirname, 'assets/pwa', name)) });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = ICONS.find((n) => req.url === `${BASE}${n}` || req.url === `/${n}`);
        if (!name) return next();
        res.setHeader('Content-Type', 'image/png');
        res.end(readFileSync(resolve(__dirname, 'assets/pwa', name)));
      });
    },
  };
}

export default defineConfig({
  base: BASE,
  publicDir: false,
  plugins: [
    react(),
    pwaIcons(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SITS AI — Saganami Island opponent',
        short_name: 'SITS AI',
        description: 'Turn-by-turn opponent and record keeper for the Saganami Island Tactical Simulator.',
        theme_color: '#1d2430',
        background_color: '#17181a',
        display: 'standalone',
        orientation: 'any',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
