// The contractor's brand on documents: logo and how to pay.
import type { Profile } from './types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The logo image for a document header, or nothing. Only a safe image data URL is ever printed. */
export function logoHtml(profile: Profile, maxHeight = 56): string {
  const src = profile.logo;
  if (!src || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(src)) return '';
  return `<img src="${src}" alt="" style="max-height:${maxHeight}px;max-width:220px;display:block;margin-bottom:8px">`;
}

/** "How to pay" block: the payment link as a button-like link, plus the contractor's own note (Zelle, checks…). */
export function payHtml(profile: Profile, lang: 'en' | 'vi' = 'en'): string {
  const link = profile.payLink && /^https:\/\/\S+$/.test(profile.payLink) ? profile.payLink : '';
  if (!link && !profile.payNote) return '';
  const T = lang === 'vi' ? { h: 'Cách thanh toán', pay: 'Thanh toán online' } : { h: 'How to pay', pay: 'Pay online' };
  return `<h2>${T.h}</h2><div class="box">${link ? `<div><a href="${esc(link)}" style="display:inline-block;background:#2457F5;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:600">${T.pay}</a> <span class="muted">${esc(link)}</span></div>` : ''}${profile.payNote ? `<div style="margin-top:6px">${esc(profile.payNote)}</div>` : ''}</div>`;
}
