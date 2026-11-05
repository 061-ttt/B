import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// STANDALONE=1 のときは1ファイルのHTML（サーバーなしで動く版）を作る
// GAS=1 のときは Google Apps Script のウェブアプリ用の1ファイルHTML（クラス共有あり。scripts/build-gas.mjs から使う）
const standalone = process.env.STANDALONE === '1';
const gas = process.env.GAS === '1';
const single = standalone || gas;

export default defineConfig({
  plugins: single
    ? [
        viteSingleFile(),
        {
          name: 'google-fonts-link',
          transformIndexHtml: (html: string) => html.replace('<title>', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&family=Outfit:wght@600;800&family=DotGothic16&display=swap" />\n  <title>'),
        },
      ]
    : [],
  define: {
    ...(standalone ? { 'import.meta.env.VITE_STANDALONE': JSON.stringify('1') } : {}),
    // 1ファイル版は書体を Google Fonts から読む（端末に保存する書体ファイルを中に入れない）
    ...(single ? { 'import.meta.env.VITE_SINGLE': JSON.stringify('1') } : {}),
  },
  build: {
    outDir: gas ? 'dist-gas' : standalone ? 'dist-standalone' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } } },
});
