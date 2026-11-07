// In-app help: short how-to topics (also published as the web Help Center), a local search that works offline,
// and the instructions for "Chat with Bidwell AI" so it answers about this app and can link to the right screen.
import TOPICS from './help.json';

export interface HelpTopic {
  id: string; title: string; vi: string; route: string; link: string; keys: string[]; answer: string;
}
export const HELP_TOPICS = TOPICS as HelpTopic[];

/** Screens the assistant may link to (anything else is dropped). */
export const HELP_ROUTES: Record<string, string> = {
  '/new': 'New estimate', '/jobs': 'Estimates', '/sites': 'Job sites', '/schedule': 'Schedule', '/settings': 'Settings',
  '/pricing': 'My pricing', '/price-book': 'Price Book', '/team': 'Crew & subs', '/account': 'Account', '/connections': 'Connected apps',
  '/terms': 'Terms and AI', '/scan': 'Scan rooms', '/report': 'Report a problem',
};

const norm = (s: string) => s.toLowerCase().normalize('NFC');

/** Best matching topics for a question, best first (works without the AI). */
export function searchHelp(q: string, max = 3): HelpTopic[] {
  const t = norm(q);
  if (!t.trim()) return [];
  const words = t.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  return HELP_TOPICS
    .map((h) => {
      let score = 0;
      for (const k of h.keys) if (t.includes(norm(k))) score += k.includes(' ') ? 3 : 2;
      const hay = norm(`${h.title} ${h.vi} ${h.answer}`);
      for (const w of words) if (hay.includes(w)) score += 0.5;
      return { h, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.h);
}

/** Instructions for the help chat: answer from the app's own how-to, in the contractor's language, and link screens. */
export function helpSystem(ctx: { company?: string; screen?: string }): string {
  const topics = HELP_TOPICS.map((h) => `## ${h.title}\n${h.answer} (Screen: ${h.route})`).join('\n\n');
  const routes = Object.entries(HELP_ROUTES).map(([r, l]) => `${r} = ${l}`).join(', ');
  return [
    'You are Bidwell Help, the support assistant inside Bidwell AI, an estimating and job management app for construction contractors.',
    ctx.company ? `You are helping ${ctx.company}.` : '',
    'Answer questions about using the app, step by step, in 2 to 6 short sentences or a short numbered list. Reply in the language the contractor writes in (English or Vietnamese).',
    'You may also answer general construction estimating questions briefly, but say prices are estimates and local codes apply.',
    'To send the contractor to a screen, end your reply with link tags like [[open:/new]] (at most 2). Only these screens exist: ' + routes + '.',
    'If you do not know, if something sounds broken, or the question is about billing, refunds, legal matters or their data, say so plainly and suggest Report a problem [[open:/report]] so a person can help. Never invent features, prices of the app, or policies.',
    'Never ask for passwords, card numbers or API keys.',
    '',
    'How the app works:',
    topics,
  ].filter(Boolean).join('\n');
}

/** Splits the assistant's reply into text and screen buttons, keeping only real screens. */
export function parseHelpReply(text: string): { text: string; links: { route: string; label: string }[] } {
  const links: { route: string; label: string }[] = [];
  const clean = text.replace(/\[\[open:([^\]\s]+)\]\]/g, (_m, r: string) => {
    if (HELP_ROUTES[r] && !links.some((l) => l.route === r)) links.push({ route: r, label: HELP_ROUTES[r] });
    return '';
  });
  return { text: clean.replace(/[ \t]+\n/g, '\n').trim(), links: links.slice(0, 2) };
}

/** What a problem report carries besides the contractor's words (no personal data beyond their account). */
export function deviceSummary(d: { os: string; osVersion: string; model?: string | null; appVersion?: string | null; build?: string | null; screen?: string }): string {
  return [`App ${d.appVersion ?? '?'} (${d.build ?? '?'})`, `${d.os} ${d.osVersion}`, d.model ?? '', d.screen ? `screen ${d.screen}` : ''].filter(Boolean).join(' · ');
}
