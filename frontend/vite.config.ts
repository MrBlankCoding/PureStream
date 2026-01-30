import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
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
  build: {
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