/** A language the app can run in. `code` also picks the voice for the microphone and for reading answers aloud. */
export interface Language {
  /** BCP-47 tag, e.g. "vi-VN". A language the user typed in gets "x-…" (no voice tag, the phone's own is used). */
  code: string;
  /** The name in the language itself: what the picker shows. */
  name: string;
  /** The name in English: what the AI is told to write in. */
  english: string;
}

/** Languages offered first. English and Tiếng Việt are complete in the app; Español has the first screens built in. */
export const BUILT_IN = ['en-US', 'vi-VN', 'es-US'];
/** Complete in the app: nothing to translate, they work before login and offline. */
export const COMPLETE = ['en-US', 'vi-VN'];

/**
 * The ten languages the app offers: the ones contractors and their clients in the US most often work in.
 * (A client document can still go out in any other language: see "Another language" under Client’s language.)
 */
export const LANGUAGES: Language[] = [
  { code: 'en-US', name: 'English', english: 'English' },
  { code: 'vi-VN', name: 'Tiếng Việt', english: 'Vietnamese' },
  { code: 'es-US', name: 'Español', english: 'Spanish' },
  { code: 'zh-CN', name: '中文', english: 'Simplified Chinese' },
  { code: 'ko-KR', name: '한국어', english: 'Korean' },
  { code: 'tl-PH', name: 'Tagalog', english: 'Tagalog' },
  { code: 'ru-RU', name: 'Русский', english: 'Russian' },
  { code: 'uk-UA', name: 'Українська', english: 'Ukrainian' },
  { code: 'pt-BR', name: 'Português', english: 'Brazilian Portuguese' },
  { code: 'hi-IN', name: 'हिन्दी', english: 'Hindi' },
];

const OTHER = 'x-';

/** A language that is not in the list: the user types its name and Studwise translates into it. */
export function customLanguage(typed: string): Language {
  const name = typed.trim().replace(/\s+/g, ' ').slice(0, 40);
  return { code: `${OTHER}${name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}`, name, english: name };
}

export function findLanguage(code: string | null | undefined, customName?: string | null): Language | null {
  if (!code) return null;
  const hit = LANGUAGES.find((l) => l.code === code);
  if (hit) return hit;
  return code.startsWith(OTHER) && customName ? { code, name: customName, english: customName } : null;
}

/** The listed language closest to the phone's own setting ("vi" matches "vi-VN"), or null. */
export function matchDevice(deviceTag: string | undefined): Language | null {
  if (!deviceTag) return null;
  const tag = deviceTag.replace('_', '-');
  const base = tag.split('-')[0].toLowerCase();
  return LANGUAGES.find((l) => l.code.toLowerCase() === tag.toLowerCase()) ?? LANGUAGES.find((l) => l.code.split('-')[0] === base) ?? null;
}

/** The tag for speech (microphone and reading aloud). A typed-in language has none: the phone decides. */
export const voiceTag = (l: Language): string | undefined => (l.code.startsWith(OTHER) ? undefined : l.code);

export const isEnglish = (l: Language | null | undefined) => !l || l.code.startsWith('en');
/** Right-to-left scripts. */
export const isRtl = (l: Language) => /^(ar|fa|he|ur)\b/.test(l.code);
