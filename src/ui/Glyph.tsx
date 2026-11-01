// 画面用の線アイコン
const P = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

export const G = {
  globe: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" /></svg>,
  map: () => <svg viewBox="0 0 24 24" {...P}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></svg>,
  book: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" /><path d="M4 19a2 2 0 0 1 2-2h13" /><path d="M9 7h6" /></svg>,
  check: () => <svg viewBox="0 0 24 24" {...P}><rect x="3" y="4" width="18" height="17" rx="4" /><path d="m8 12 3 3 5-6" /></svg>,
  pen: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>,
  plus: () => <svg viewBox="0 0 24 24" {...P} stroke-width={2.4}><path d="M12 5v14M5 12h14" /></svg>,
  layers: () => <svg viewBox="0 0 24 24" {...P}><path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" /></svg>,
  users: () => <svg viewBox="0 0 24 24" {...P}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5 6.5-5s5.7 1.5 6.5 5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.2 2.2 3.5 5" /></svg>,
  chev: () => <svg class="chev" viewBox="0 0 24 24" {...P}><path d="m6 9 6 6 6-6" /></svg>,
  left: () => <svg viewBox="0 0 24 24" {...P}><path d="m15 6-6 6 6 6" /></svg>,
  right: () => <svg viewBox="0 0 24 24" {...P}><path d="m9 6 6 6-6 6" /></svg>,
  mic: () => <svg viewBox="0 0 24 24" {...P}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  spark: () => <svg viewBox="0 0 24 24" {...P}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>,
  target: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>,
  printer: () => <svg viewBox="0 0 24 24" {...P}><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></svg>,
  x: () => <svg viewBox="0 0 24 24" {...P}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  home: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></svg>,
};
