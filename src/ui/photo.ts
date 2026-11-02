// 魚の写真（Wikimedia Commons の自由に使える写真を同梱）。出典は src/data/photo-credits.json
import credits from '../data/photo-credits.json';

const large = import.meta.glob('../assets/fish/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function pick(id: string, small: boolean): string | null {
  return large[`../assets/fish/${id}${small ? '-s' : ''}.webp`] ?? null;
}

export interface Credit { file: string; license: string; author: string; page: string }
export const CREDITS = credits as Record<string, Credit>;

/** 写真のURL（ないときは null。アイコンで代用する） */
export function photo(id: string | null | undefined, small = false): string | null {
  return id ? pick(id, small) : null;
}

// 地球儀に立てる魚の3Dフィギュア（Canva の画像生成でつくり、背景を切り抜いたもの）
const figs = import.meta.glob('../assets/fig/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export function figure(id: string | null | undefined): string | null {
  return id ? figs[`../assets/fig/${id}.webp`] ?? null : null;
}
