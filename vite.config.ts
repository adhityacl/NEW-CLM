import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import viteCompression from 'vite-plugin-compression';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      viteCompression({ algorithm: 'gzip', ext: '.gz' }),
      viteCompression({ algorithm: 'brotliCompress', ext: '.br' })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('recharts')) return 'chart-vendor';
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor-vendor';
            if (id.includes('googleapis') || id.includes('firebase')) return 'external-api-vendor';
            if (id.includes('docx') || id.includes('pdf-lib') || id.includes('pdf-parse') || id.includes('react-markdown')) return 'doc-vendor';
            if (id.includes('react') || id.includes('@tanstack/react-query')) return 'react-vendor';
            return 'vendor';
          },
        },
      },
    },

    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        // SQLite writes to its -wal/-shm files (and the app rewrites
        // data_store.json) continuously during normal use — none of that is
        // source code, so it must never trigger a client page reload.
        ignored: [
          '**/*.db',
          '**/*.db-wal',
          '**/*.db-shm',
          '**/data_store.json',
        ],
      },
    },
  };
});
