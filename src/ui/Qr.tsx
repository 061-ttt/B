import { signal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import qrcode from 'qrcode-generator';
import { joinRoom } from '../core/sync';
import { showToast } from '../state';
import { G } from './Glyph';

export function qrSvg(text: string): string {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

/** 参加用のリンク */
export function joinUrl(code: string | null): string {
  const u = new URL(location.pathname, location.origin);
  if (code) u.searchParams.set('room', code);
  return u.toString();
}

/** QRコードやリンクの文字からクラスコードを取り出す */
export function codeFrom(text: string): string | null {
  const t = text.trim();
  try {
    const u = new URL(t);
    const r = u.searchParams.get('room');
    if (r && /^[A-Z0-9]{6}$/i.test(r)) return r.toUpperCase();
  } catch { /* URLではない */ }
  const m = t.match(/(?:^|[^A-Z0-9])([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6})(?:$|[^A-Z0-9])/i);
  return m ? m[1].toUpperCase() : null;
}

export const bigQr = signal<{ code: string | null } | null>(null);
export const scanning = signal(false);

/** 電子黒板に映す大きなQRコード */
export function QrBig() {
  const b = bigQr.value;
  const url = b ? joinUrl(b.code) : '';
  const svg = useMemo(() => (url ? qrSvg(url) : ''), [url]);
  useEffect(() => {
    if (!b) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') bigQr.value = null; };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [b]);
  if (!b) return null;
  return (
    <div class="qr-big" role="dialog" aria-modal="true" aria-label="参加用のQRコード" data-testid="qr-big" onClick={() => (bigQr.value = null)}>
      <div class="qr-big-in" onClick={(e) => e.stopPropagation()}>
        <div class="qr-big-code" dangerouslySetInnerHTML={{ __html: svg }} data-testid="qr-big-svg" />
        {b.code ? (
          <>
            <p class="qr-big-label">カメラで読み取るか、コードを入力して参加</p>
            <div class="code">{b.code}</div>
          </>
        ) : <p class="qr-big-label">カメラで読み取ると、このアプリが開きます</p>}
        <p class="qr-big-url">{url}</p>
        <button class="btn block" onClick={() => (bigQr.value = null)}>閉じる</button>
      </div>
    </div>
  );
}

type BD = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };

/** カメラでQRコードを読み取って参加する */
export function QrScanner() {
  const on = scanning.value;
  const video = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState('QRコードを枠の中に写してください');
  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let stop = false;
    let raf = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        setMsg('カメラが使えません。閉じて、クラスコードを入力して参加してください');
        return;
      }
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      const BDc = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BD }).BarcodeDetector;
      let detector: BD | null = null;
      if (BDc) try { detector = new BDc({ formats: ['qr_code'] }); } catch { detector = null; }
      const jsQR = detector ? null : (await import('jsqr')).default;
      const cv = document.createElement('canvas');
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      const tick = async () => {
        if (stop) return;
        if (v.readyState >= 2 && v.videoWidth) {
          let text: string | null = null;
          if (detector) {
            try { text = (await detector.detect(v))[0]?.rawValue ?? null; } catch { text = null; }
          } else if (jsQR) {
            const w = Math.min(640, v.videoWidth), h = Math.round((w / v.videoWidth) * v.videoHeight);
            cv.width = w; cv.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null;
          }
          const code = text ? codeFrom(text) : null;
          if (code) {
            if (navigator.vibrate) try { navigator.vibrate(30); } catch { /* */ }
            scanning.value = false;
            await joinRoom(code);
            showToast(`クラス ${code} に参加しました`);
            return;
          }
          if (text) setMsg('このアプリの参加用QRコードではないようです');
        }
        raf = requestAnimationFrame(() => { tick(); });
      };
      tick();
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [on]);
  if (!on) return null;
  return (
    <div class="qr-scan" role="dialog" aria-modal="true" aria-label="QRコードを読み取る" data-testid="qr-scan">
      <video ref={video} playsInline muted />
      <div class="qr-frame" aria-hidden="true"><i /><i /><i /><i /></div>
      <p class="qr-msg" data-testid="qr-msg">{msg}</p>
      <button class="btn qr-close" onClick={() => (scanning.value = false)}><G.x />閉じる</button>
    </div>
  );
}
