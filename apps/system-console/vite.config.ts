import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/sys/',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', sourcemap: false, manifest: true },
});
