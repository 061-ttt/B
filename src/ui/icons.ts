import type { Icon } from '../data/fish';

// 魚などのシルエット（viewBox 0 0 48 32）。色は currentColor
const PATHS: Record<Icon, string> = {
  fish: '<path d="M4 16c6-8 18-11 28-5l9-6v22l-9-6C22 27 10 24 4 16z"/><circle cx="12" cy="14.5" r="1.8" fill="#000" fill-opacity=".55"/><path d="M19 9c2 4 2 10 0 14" stroke="#000" stroke-opacity=".25" stroke-width="1.4" fill="none"/>',
  tuna: '<path d="M2 16c7-9 20-11 30-6l3-4 2 6 9-5-4 9 4 9-9-5-2 6-3-4C22 27 9 25 2 16z"/><circle cx="10" cy="14.5" r="1.8" fill="#000" fill-opacity=".55"/><path d="M14 18h16" stroke="#000" stroke-opacity=".25" stroke-width="1.6"/>',
  flat: '<path d="M6 16c3-9 22-12 30-4l8-4-2 8 2 8-8-4c-8 8-27 5-30-4z"/><circle cx="12" cy="12.5" r="1.6" fill="#000" fill-opacity=".55"/><circle cx="15" cy="10.5" r="1.6" fill="#000" fill-opacity=".55"/>',
  shrimp: '<path d="M38 8c-8-4-20-2-26 6-4 5-3 11 3 13 4 1 6-2 5-4 6 1 13-3 16-9l6-1-4-3z"/><path d="M38 8 46 3M37 9l9 1" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="34" cy="10" r="1.4" fill="#000" fill-opacity=".55"/><path d="M18 13l3 8M24 11l2 8M30 10l1 6" stroke="#000" stroke-opacity=".25" stroke-width="1.3"/>',
  squid: '<path d="M6 16 16 8h14l12 8-12 8H16z"/><path d="M30 10c6 1 10 4 14 6-4 2-8 5-14 6M44 16l3-3M44 16l3 3" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="27" cy="14" r="1.6" fill="#000" fill-opacity=".55"/>',
  octopus: '<path d="M24 3c-8 0-13 5-13 12 0 3 1 5 3 7l-6 6c3 1 6 0 8-3l1 5c2 0 4-2 4-5l3 5 3-5c0 3 2 5 4 5l1-5c2 3 5 4 8 3l-6-6c2-2 3-4 3-7 0-7-5-12-13-12z"/><circle cx="19.5" cy="15" r="1.8" fill="#000" fill-opacity=".55"/><circle cx="28.5" cy="15" r="1.8" fill="#000" fill-opacity=".55"/>',
  shell: '<path d="M24 4c-11 0-18 9-18 18 0 3 2 5 5 5h26c3 0 5-2 5-5 0-9-7-18-18-18z"/><path d="M24 6v20M15 9l4 17M33 9l-4 17M9 15l7 11M39 15l-7 11" stroke="#000" stroke-opacity=".25" stroke-width="1.3" fill="none"/>',
  crab: '<ellipse cx="24" cy="19" rx="12" ry="8"/><path d="M12 15 6 8l2-4 3 4-1-5M36 15l6-7-2-4-3 4 1-5M13 22l-8 3M13 25l-6 5M35 22l8 3M35 25l6 5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="20" cy="14" r="1.6" fill="#000" fill-opacity=".55"/><circle cx="28" cy="14" r="1.6" fill="#000" fill-opacity=".55"/>',
  seaweed: '<path d="M14 30c-3-8 4-10 0-18 4 4 6 10 3 18zM24 30c-4-10 6-14 0-26 6 6 8 16 4 26zM34 30c-3-7 4-9 0-16 4 3 6 9 3 16z"/>',
  roe: '<circle cx="14" cy="18" r="6"/><circle cx="26" cy="14" r="6"/><circle cx="36" cy="20" r="6"/><circle cx="24" cy="25" r="5"/><circle cx="12" cy="16" r="1.6" fill="#fff" fill-opacity=".7"/><circle cx="24" cy="12" r="1.6" fill="#fff" fill-opacity=".7"/><circle cx="34" cy="18" r="1.6" fill="#fff" fill-opacity=".7"/>',
  eel: '<path d="M3 18c6-6 12-6 18-2s12 4 18-2c3-3 6-3 7 0-3 0-4 2-7 5-6 6-14 6-20 2s-10-4-16-1z"/><circle cx="41" cy="14.5" r="1.2" fill="#000" fill-opacity=".55"/>',
};

let seq = 0;
function mix(hex: string, to: number, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
/** 立体感のあるアイコン：上から光が当たったグラデーション＋つや */
export function iconSvg(icon: Icon, color: string, size = 28): string {
  const id = `ig${(seq++).toString(36)}`;
  const body = PATHS[icon].match(/^<[^>]+>/)?.[0] ?? '';
  return `<svg viewBox="0 0 48 32" width="${size}" height="${Math.round(size * 0.667)}" fill="url(#${id})" style="color:${color};overflow:visible" aria-hidden="true">`
    + `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(color, 255, 0.5)}"/><stop offset=".55" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, 0, 0.45)}"/></linearGradient>`
    + `<radialGradient id="${id}h" cx=".35" cy=".2" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`
    + `${PATHS[icon]}<g fill="url(#${id}h)">${body}</g></svg>`;
}
