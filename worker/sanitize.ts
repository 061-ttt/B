import { FISH_BY_ID } from '../src/data/fish';
import { PLACE_BY_ID } from '../src/data/places';

export interface Entry {
  id: string; fishId: string | null; fishName: string; placeId: string;
  method: 'wild' | 'farmed' | 'unknown'; group: number; at: number; device: string;
}

/** 受け取った入力を検査して、安全な形に整える */
export function sanitize(x: unknown): Entry | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '');
  const id = str(o.id, 40);
  const placeId = str(o.placeId, 40);
  const fishId = o.fishId == null ? null : str(o.fishId, 40);
  const fishName = str(o.fishName, 24);
  const device = str(o.device, 40);
  if (!/^[a-z0-9]{4,40}$/i.test(id) || !PLACE_BY_ID.has(placeId) || !fishName || !device) return null;
  if (fishId !== null && !FISH_BY_ID.has(fishId)) return null;
  const method = o.method === 'wild' || o.method === 'farmed' ? o.method : 'unknown';
  const group = Math.max(1, Math.min(8, Math.round(Number(o.group) || 1)));
  const at = Math.min(Date.now() + 60_000, Math.max(0, Number(o.at) || Date.now()));
  return { id, fishId, fishName, placeId, method, group, at, device };
}

