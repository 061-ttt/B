import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// STANDALONE=1 のときは1ファイルのHTML（サーバーなしで動く版）を作る
const standalone = process.env.STANDALONE === '1';

export default defineConfig({
  plugins: standalone ? [viteSingleFile()] : [],
  define: standalone ? { 'import.meta.env.VITE_STANDALONE': JSON.stringify('1') } : {},
  build: {
    outDir: standalone ? 'dist-standalone' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } } },
});
