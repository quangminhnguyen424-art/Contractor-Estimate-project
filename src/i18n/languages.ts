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

export const LANGUAGES: Language[] = [
  { code: 'en-US', name: 'English', english: 'English' },
  { code: 'vi-VN', name: 'Tiếng Việt', english: 'Vietnamese' },
  { code: 'es-US', name: 'Español', english: 'Spanish' },
  { code: 'zh-CN', name: '简体中文', english: 'Simplified Chinese' },
  { code: 'zh-TW', name: '繁體中文', english: 'Traditional Chinese' },
  { code: 'yue-HK', name: '粵語', english: 'Cantonese (Traditional Chinese script)' },
  { code: 'ko-KR', name: '한국어', english: 'Korean' },
  { code: 'tl-PH', name: 'Tagalog', english: 'Tagalog' },
  { code: 'ru-RU', name: 'Русский', english: 'Russian' },
  { code: 'uk-UA', name: 'Українська', english: 'Ukrainian' },
  { code: 'pt-BR', name: 'Português', english: 'Brazilian Portuguese' },
  { code: 'pl-PL', name: 'Polski', english: 'Polish' },
  { code: 'ro-RO', name: 'Română', english: 'Romanian' },
  { code: 'fr-FR', name: 'Français', english: 'French' },
  { code: 'ht-HT', name: 'Kreyòl ayisyen', english: 'Haitian Creole' },
  { code: 'de-DE', name: 'Deutsch', english: 'German' },
  { code: 'it-IT', name: 'Italiano', english: 'Italian' },
  { code: 'el-GR', name: 'Ελληνικά', english: 'Greek' },
  { code: 'tr-TR', name: 'Türkçe', english: 'Turkish' },
  { code: 'ar-SA', name: 'العربية', english: 'Arabic' },
  { code: 'fa-IR', name: 'فارسی', english: 'Persian' },
  { code: 'he-IL', name: 'עברית', english: 'Hebrew' },
  { code: 'hi-IN', name: 'हिन्दी', english: 'Hindi' },
  { code: 'pa-IN', name: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
  { code: 'ur-PK', name: 'اردو', english: 'Urdu' },
  { code: 'bn-BD', name: 'বাংলা', english: 'Bengali' },
  { code: 'ne-NP', name: 'नेपाली', english: 'Nepali' },
  { code: 'ja-JP', name: '日本語', english: 'Japanese' },
  { code: 'th-TH', name: 'ไทย', english: 'Thai' },
  { code: 'km-KH', name: 'ខ្មែរ', english: 'Khmer' },
  { code: 'lo-LA', name: 'ລາວ', english: 'Lao' },
  { code: 'my-MM', name: 'မြန်မာ', english: 'Burmese' },
  { code: 'id-ID', name: 'Bahasa Indonesia', english: 'Indonesian' },
  { code: 'hmn', name: 'Hmoob', english: 'Hmong' },
  { code: 'sm-WS', name: 'Gagana Sāmoa', english: 'Samoan' },
  { code: 'so-SO', name: 'Soomaali', english: 'Somali' },
  { code: 'am-ET', name: 'አማርኛ', english: 'Amharic' },
  { code: 'ti-ER', name: 'ትግርኛ', english: 'Tigrinya' },
  { code: 'sw-KE', name: 'Kiswahili', english: 'Swahili' },
  { code: 'sq-AL', name: 'Shqip', english: 'Albanian' },
  { code: 'sr-RS', name: 'Српски', english: 'Serbian' },
  { code: 'bs-BA', name: 'Bosanski', english: 'Bosnian' },
  { code: 'hy-AM', name: 'Հայերեն', english: 'Armenian' },
  { code: 'ka-GE', name: 'ქართული', english: 'Georgian' },
];

const OTHER = 'x-';

/** A language that is not in the list: the user types its name and Bidwell translates into it. */
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
  if (base === 'zh') return LANGUAGES.find((l) => l.code === (/(TW|HK|MO|Hant)/i.test(tag) ? 'zh-TW' : 'zh-CN')) ?? null;
  return LANGUAGES.find((l) => l.code.toLowerCase() === tag.toLowerCase()) ?? LANGUAGES.find((l) => l.code.split('-')[0] === base) ?? null;
}

/** The tag for speech (microphone and reading aloud). A typed-in language has none: the phone decides. */
export const voiceTag = (l: Language): string | undefined => (l.code.startsWith(OTHER) ? undefined : l.code);

export const isEnglish = (l: Language | null | undefined) => !l || l.code.startsWith('en');
/** Right-to-left scripts. */
export const isRtl = (l: Language) => /^(ar|fa|he|ur)\b/.test(l.code);
