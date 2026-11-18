import { COMPANY } from './company';

/** Short how-to videos, one per part of the app, on the website. */
export interface Tutorial { id: string; title: string; sub: string }

export const TUTORIALS: Tutorial[] = [
  { id: '01-start', title: 'Get started', sub: 'Your company, your work and your prices' },
  { id: '02-estimate', title: 'Price a job by voice', sub: 'Say the job, Studwise builds the estimate' },
  { id: '03-quote', title: 'Send the quote and get it signed', sub: 'Change any part, text a link, sign on the phone' },
  { id: '04-money', title: 'Invoices and payments', sub: 'Invoices, payments and change orders' },
  { id: '05-site', title: 'Job site, photos and crew', sub: 'Photos by area, work orders, crew days' },
  { id: '06-permit', title: 'Permit helper', sub: 'What permits a job needs and how to apply' },
  { id: '07-adu', title: 'ADU check and new leads', sub: 'A free page for homeowners that brings you leads' },
  { id: '08-learn', title: 'Ask Studwise', sub: 'Chat, learning from your quotes, help' },
];

/** Video languages made so far; any other app language gets the English video (it has captions). */
const VIDEO_LANGS = ['en'] as const;

/** Where a tutorial video is, in the app's language when there is a version in it. */
export function tutorialUrl(id: string, appLanguage?: string | null): string {
  const base = (appLanguage ?? 'en').toLowerCase().split('-')[0];
  const lang = (VIDEO_LANGS as readonly string[]).includes(base) ? base : 'en';
  return `${COMPANY.site}/videos/${id}-${lang}.mp4`;
}
