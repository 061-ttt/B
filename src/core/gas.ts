// Google Apps Script（GAS）のウェブアプリとして動くときの通信。
// 学校のフィルタで外部のサーバーやWebSocketが止められていても、script.google.com は通ることが多い。
// サーバー側は gas/Code.gs（scripts/build-gas.mjs が作る）。データは先生のGoogleスプレッドシートに保存する。

export interface GasConfig {
  /** このウェブアプリのURL（…/exec）。QRコードに使う */
  url: string;
  /** URL の ?room=○○ */
  room?: string | null;
}

type Runner = Record<string, (...a: unknown[]) => void> & {
  withSuccessHandler(f: (r: unknown) => void): Runner;
  withFailureHandler(f: (e: unknown) => void): Runner;
};

const w = (typeof window !== 'undefined' ? window : {}) as { __GAS__?: GasConfig; google?: { script?: { run?: Runner } } };

/** Apps Script の中で開かれているときだけ設定がある */
export const GAS: GasConfig | null = w.__GAS__ && typeof w.__GAS__.url === 'string' ? w.__GAS__ : null;

/** サーバーの関数を呼ぶ。15秒で返事がなければ失敗にする */
export function gasCall<T>(fn: string, ...args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = w.google?.script?.run;
    if (!run) { reject(new Error('no-gas')); return; }
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; reject(new Error('timeout')); } }, 15000);
    run
      .withSuccessHandler((r) => { if (done) return; done = true; clearTimeout(t); resolve(r as T); })
      .withFailureHandler((e) => { if (done) return; done = true; clearTimeout(t); reject(e instanceof Error ? e : new Error(String(e))); })[fn](...args);
  });
}
