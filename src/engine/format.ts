import { dateLocale } from './locale';

export const money = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

export const money2 = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const qtyFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

/** A date like "Nov 13, 2026". With a language it is for a client document; without, for the contractor's own screen. */
export const dateFmt = (iso: string, lang?: 'en' | 'vi') =>
  new Date(iso).toLocaleDateString(lang === 'vi' ? 'vi-VN' : lang === 'en' ? 'en-US' : dateLocale(), { year: 'numeric', month: 'short', day: 'numeric' });

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
