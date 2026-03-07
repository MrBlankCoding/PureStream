import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  server: {
    proxy: {
      '/new-room': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      }
    }
  },
  plugins: [
    {
      name: "beacon-file-runtime-html",
      enforce: "post",
      transformIndexHtml(html, ctx) {
        // Keep dev-server HTML untouched so ESM scripts still run.
        if (!ctx?.bundle) {
          return html;
        }
        // Remove crossorigin which breaks file:// protocol in some WebKit versions
        // But KEEP type="module" since we are using ESM imports in the bundle
        return html
          .replace(/\s+crossorigin(?:="[^"]*")?/g, "");
      }
    }
  ],
  build: {
    modulePreload: false,
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        viewer: resolve(__dirname, 'viewer.html'),
      },
    },
  },
  resolve: {
    alias: {
      // lucide's package.json points to a non-existent esm entry; use the cjs bundle
      lucide: resolve(__dirname, 'node_modules/lucide/dist/cjs/lucide.js'),
    },
  },
});
