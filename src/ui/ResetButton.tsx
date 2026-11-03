import { useState } from 'preact/hooks';

/** 消してしまう操作は2回たしかめる（ブラウザの確認ダイアログは使わず、その場で「本当に？」を出す） */
export function ResetButton(props: { label: string; warn: string; onReset: () => Promise<boolean> | boolean; testid: string }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ask) return <button class="btn reset-btn" onClick={() => setAsk(true)} data-testid={props.testid}>{props.label}</button>;
  return (
    <div class="reset-ask" role="alertdialog" aria-label={props.label} data-testid={`${props.testid}-ask`}>
      <p>{props.warn}</p>
      <div class="reset-acts">
        <button class="btn" onClick={() => setAsk(false)} disabled={busy}>やめる</button>
        <button class="btn danger" disabled={busy} data-testid={`${props.testid}-ok`}
          onClick={async () => { setBusy(true); const ok = await props.onReset(); setBusy(false); if (ok) setAsk(false); }}>
          {busy ? '消しています…' : 'リセットする'}
        </button>
      </div>
    </div>
  );
}
