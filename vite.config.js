import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Emits a service worker that precaches every built file so the app works offline.
function serviceWorker() {
  return {
    name: 'dynoword-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const statics = ['./', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
        'legal/legal.css', 'legal/terms.html', 'legal/privacy.html', 'legal/refunds.html'];
      const version = Date.now().toString(36);
      const source = readFileSync('src/sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__ASSETS__', JSON.stringify([...statics, ...assets.map((a) => `./${a}`)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: {
    target: ['es2020', 'safari15', 'chrome100', 'edge100', 'firefox100'],
    chunkSizeWarningLimit: 1500,
  },
});
