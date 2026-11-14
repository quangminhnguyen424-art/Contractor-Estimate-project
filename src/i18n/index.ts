import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import catalogJson from './catalog.json';
import esJson from './es.json';
import viJson from './vi.json';
import { createTranslator, readTranslations, translationPrompt, type Catalog, type Dict, type Translator } from './core';
import { findLanguage, isEnglish, matchDevice, voiceTag as tagOf, type Language } from './languages';
import { setDateLocale } from '@/engine/locale';

/**
 * The app's language. One choice, made on the first screen and changed under Me → Language, sets the wording of
 * every screen, the language Bidwell answers in, and the voice.
 *
 * English and Tiếng Việt are complete in the app (Español has its first screens). Anything a language is missing is
 * translated by Bidwell AI the first time (after login, because the AI needs an account), kept on the phone, and
 * used from then on without a network.
 */
const catalog = catalogJson as Catalog;
const LANG_KEY = 'bidwell/language';
const dictKey = (code: string) => `bidwell/i18n/${code}`;
const BATCH = 40;
const PARALLEL = 3;

type Complete = (prompt: string, maxTokens: number) => Promise<string>;
type T = (text: string) => string;

const identity: T = (s) => s;
let language: Language | null = null;
let chosen = false; // false until the user has picked on this phone
let ready = false;
let dict: Dict = {};
let translator: Translator | null = null;
let t: T = identity;
let complete: Complete | null = null;
const queue = new Set<string>();
const failed = new Set<string>();
let working = 0;
let progress = { done: 0, total: 0 };
const listeners = new Set<() => void>();
interface Snapshot { language: Language | null; chosen: boolean; ready: boolean; progress: { done: number; total: number } }
let snapshot: Snapshot = { language, chosen, ready, progress };

function emit() {
  snapshot = { language, chosen, ready, progress };
  listeners.forEach((l) => l());
}

// A new function each time the wording changes, so every text on screen is drawn again.
function rebuild() {
  setDateLocale(language ? tagOf(language) : undefined);
  if (!language || isEnglish(language)) { translator = null; t = identity; return; }
  const tr = createTranslator(catalog, dict, need);
  translator = tr;
  t = (s) => tr.translate(s);
}

function builtIn(code: string): Dict {
  if (code === 'vi-VN') return viJson as Dict;
  if (code === 'es-US') return esJson as Dict;
  return {};
}

async function loadDict(l: Language): Promise<Dict> {
  if (isEnglish(l)) return {};
  const base = builtIn(l.code);
  try {
    const saved = await AsyncStorage.getItem(dictKey(l.code));
    // What ships with the app wins over what the AI wrote earlier.
    return saved ? { ...(JSON.parse(saved) as Dict), ...base } : { ...base };
  } catch {
    return { ...base };
  }
}

/** Called by the translator when a text of the app has no translation yet. */
function need(source: string) {
  if (!language || isEnglish(language) || dict[source] !== undefined || failed.has(source) || queue.has(source)) return;
  queue.add(source);
  schedule();
}

let timer: ReturnType<typeof setTimeout> | null = null;
function schedule() {
  if (timer || !complete) return;
  timer = setTimeout(() => { timer = null; void pump(); }, 120);
}

async function pump() {
  const ai = complete;
  const l = language;
  if (!ai || !l || working >= PARALLEL || !queue.size) return;
  const batch = [...queue].slice(0, BATCH);
  batch.forEach((s) => queue.delete(s));
  working++;
  if (queue.size) void pump();
  try {
    const got = readTranslations(batch, await ai(translationPrompt(l.english, batch), 4000));
    if (language?.code === l.code) {
      for (const s of batch) if (got[s] === undefined) failed.add(s); // shown in English; not asked again this session
      if (Object.keys(got).length) {
        dict = { ...dict, ...got };
        AsyncStorage.setItem(dictKey(l.code), JSON.stringify(dict)).catch(() => {});
        rebuild();
      }
      progress = { done: progress.done + batch.length, total: progress.total };
      emit();
    }
  } catch {
    // No signal, or the day's AI limit: keep English for now and try these again next time the app opens.
    batch.forEach((s) => failed.add(s));
    progress = { done: progress.done + batch.length, total: progress.total };
    emit();
  } finally {
    working--;
    if (queue.size) void pump();
  }
}

/** Translate the whole app now instead of screen by screen, so nothing flips from English while it is used. */
export function translateEverything() {
  if (!language || isEnglish(language)) return;
  const all = [...catalog.exact, ...catalog.patterns].filter((s) => dict[s] === undefined && !failed.has(s));
  if (!all.length) return;
  progress = { done: 0, total: all.length };
  all.forEach((s) => queue.add(s));
  emit();
  schedule();
}

/** How the AI is reached. Set once the user is logged in (or has their own key); texts asked for earlier wait. */
export function setTranslationAI(fn: Complete | null) {
  const first = !complete && !!fn;
  complete = fn;
  // Finish the whole app in the background the first time there is an AI to ask, not screen by screen.
  if (first && chosen && !progress.total) translateEverything();
  if (fn && queue.size) schedule();
}

/** The AI as the translator reaches it, or null before login. Client documents use it too (see documents.ts). */
export const translationAI = (): Complete | null => complete;

function deviceTag(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().locale; } catch { return undefined; }
}
/** The listed language closest to the phone's setting: shown first on the "Your language" screen. */
export const deviceLanguage = (): Language | null => matchDevice(deviceTag());

/** Read the saved choice when the app starts. */
export async function initLanguage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LANG_KEY);
    const saved = raw ? (JSON.parse(raw) as { code?: string; name?: string }) : null;
    const l = findLanguage(saved?.code, saved?.name);
    if (l) { language = l; chosen = true; dict = await loadDict(l); }
  } catch {
    // No storage (a private browser window): the choice is asked again next time.
  }
  rebuild();
  ready = true;
  emit();
}

/** Show the app in a language without saving the choice (the "Your language" screen, before Continue). */
export async function previewLanguage(l: Language): Promise<void> {
  language = l;
  dict = await loadDict(l);
  rebuild();
  emit();
}

export async function setLanguage(l: Language): Promise<void> {
  language = l;
  chosen = true;
  queue.clear(); failed.clear();
  progress = { done: 0, total: 0 };
  dict = await loadDict(l);
  rebuild();
  emit();
  AsyncStorage.setItem(LANG_KEY, JSON.stringify({ code: l.code, name: l.name })).catch(() => {});
  translateEverything();
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const get = () => snapshot;
const getT = () => t;

/**
 * In a component: `const t = useT();` then `t('Save')`. Texts inside <Text> are translated for you.
 * The function itself changes when the wording does, which is what makes the screen draw again.
 */
export function useT(): T {
  return useSyncExternalStore(subscribe, getT, getT);
}

export function useLanguage(): Snapshot {
  return useSyncExternalStore(subscribe, get, get);
}

/** Outside components (alerts, notifications): the wording as it is right now. */
export const tr: T = (text) => t(text);
export const currentLanguage = (): Language | null => language;
/** Whether a text is the app's own wording. */
export const isAppText = (text: string) => !!translator?.known(text);

/** The contractor's language by its English name ("Vietnamese"), or undefined for English: for AI instructions. */
export const aiLanguage = (): string | undefined => (!language || isEnglish(language) ? undefined : language.english);

/** One line for AI instructions, so Bidwell writes to the contractor in their language. */
export function aiLanguageLine(): string {
  return !language || isEnglish(language) ? '' : `\nWrite everything the contractor will read in ${language.english}. Keep numbers, units (SF, LF, EA) and product names as they are.`;
}

export { LANGUAGES, customLanguage, isEnglish, voiceTag, type Language } from './languages';
