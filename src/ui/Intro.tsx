import { signal } from '@preact/signals';
import hero from '../assets/art/hero.webp';
import step1 from '../assets/art/step1.webp';
import step2 from '../assets/art/step2.webp';
import step3 from '../assets/art/step3.webp';
import step4 from '../assets/art/step4.webp';
import { room, sheet } from '../state';
import { G } from './Glyph';

// 開いたときの案内画面。タブを開き直すたびに1回だけ出る（「使い方」ボタンでいつでも出せる）
const KEY = 'sm.intro';
function seen() { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } }
export const intro = signal(!seen());

export function closeIntro() {
  intro.value = false;
  try { sessionStorage.setItem(KEY, '1'); } catch { /* */ }
}

// Esc で閉じる（画面が出た直後でも効くよう、ずっと待ち受ける）
addEventListener('keydown', (e) => { if (e.key === 'Escape' && intro.value) closeIntro(); });

const STEPS = [
  { no: '01', n: 'var(--blue)', t: '鮮魚シールを見る', s: 'どこの産地？', img: step1 },
  { no: '02', n: 'var(--violet)', t: '地球儀にのせる', s: 'みんなのデータが集まる', img: step2 },
  { no: '03', n: 'var(--red)', t: 'くらべる', s: '暖流・寒流・海の深さ', img: step3 },
  { no: '04', n: 'var(--green)', t: 'なぜ？を考える', s: '次に調べたいことへ', img: step4 },
];

export function Intro() {
  if (!intro.value) return null;
  return (
    <section class="intro" role="dialog" aria-modal="true" aria-label="はじめに" data-testid="intro">
      <div class="intro-in">
        <div class="intro-top">
          <span class="intro-chip">小5 社会</span>
          <button class="intro-skip" onClick={closeIntro} aria-label="閉じる"><G.x /></button>
        </div>
        <div class="intro-hero">
          <div class="intro-copy">
            <p class="intro-eyebrow"><span class="em">産地</span>を<span class="em">地球儀</span>で、<span class="dots">くらべる</span></p>
            <h1 class="intro-title">水産業の<br />さかんな<br />地域</h1>
            <p class="intro-sub">─ <span class="nb">「どこから来た？」から、</span><span class="nb"><b>「なぜそこ？」</b>へ ─</span></p>
          </div>
          <div class="intro-art" aria-hidden="true">
            <img src={hero} alt="" />
            <span class="intro-arrow" />
          </div>
        </div>
        <div class="intro-badge">
          <span class="hex" aria-hidden="true">
            <svg viewBox="0 0 64 64"><path d="M32 4 56 18v28L32 60 8 46V18z" /></svg>
            <b>3D</b>
          </span>
          <p>クラス全員の魚が<br /><span class="em">1つの地球儀</span>に集まる</p>
        </div>
        <div class="rule intro-rule"><i /><span><b>この時間</b>の流れ</span><s /></div>
        <ol class="intro-steps">
          {STEPS.map((s, i) => (
            <li key={s.no} class="step" style={{ '--n': s.n, '--d': `${0.15 + i * 0.08}s` }}>
              <div class="step-h"><span class="num" style={{ '--n': s.n }}>{s.no}</span><span class="step-t">{s.t}</span></div>
              <img src={s.img} alt="" />
              <p class="step-s">{s.s}</p>
            </li>
          ))}
        </ol>
        <div class="intro-cta">
          <button class="btn primary block" onClick={closeIntro} data-testid="intro-start"><G.globe />はじめる</button>
          {!room.value && <button class="btn block" onClick={() => { closeIntro(); sheet.value = 'room'; }}><G.qr />クラスに参加する</button>}
        </div>
        <p class="intro-credit">画像：Canva で作成</p>
      </div>
    </section>
  );
}
