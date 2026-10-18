// Utilitários de texto compartilhados.
import { norm } from './classify.js';

const STOP = new Set('para com uma por que dos das nos nas como mais sobre apos ante entre este esta isso essa seu sua the and for with from that this after over into amid says say new'.split(' '));

export const tokens = (t) => new Set(norm(t).replace(/[^a-z0-9% ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)));

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Datas em America/Sao_Paulo no formato AAAA-MM-DD. */
export const brtDate = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export const dayNum = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
export const addDays = (iso, n) => new Date((dayNum(iso) + n) * 86400000).toISOString().slice(0, 10);
export const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = domingo
export const fmtBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
