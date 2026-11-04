import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

/** 下から出るガラスのシート。つまみを下へ引くと閉じる */
export function BottomSheet({ open, onClose, children, label, testid }: { open: boolean; onClose: () => void; children: ComponentChildren; label: string; testid?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    const t = setTimeout(() => setMounted(false), 520);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open]);

  const down = (e: PointerEvent) => {
    if ((ref.current?.scrollTop ?? 0) > 0) return;
    drag.current = { y: e.clientY, dy: 0 };
    ref.current?.classList.add('dragging');
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    ref.current.style.setProperty('--drag', `${drag.current.dy}px`);
  };
  const up = () => {
    if (!drag.current || !ref.current) return;
    const close = drag.current.dy > 90;
    ref.current.classList.remove('dragging');
    ref.current.style.setProperty('--drag', '0px');
    drag.current = null;
    if (close) onClose();
  };

  return (
    <>
      <div class={`backdrop ${open ? 'on' : ''}`} onClick={onClose} />
      <div ref={ref} class={`bsheet glass strong ${open ? 'on' : ''}`} role="dialog" aria-modal="true" aria-label={label} aria-hidden={!open} data-testid={testid} inert={!open}>
        <div class="grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ touchAction: 'none', padding: '8px 0', margin: '-4px auto 6px', backgroundClip: 'content-box', height: '21px' }} />
        <button class="bsheet-x" onClick={onClose} aria-label="閉じる">×</button>
        {(open || mounted) && children}
      </div>
    </>
  );
}
