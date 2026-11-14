import { useEffect, useState } from 'react';

import { unpackSigned } from '@/engine/brand';
import { acceptedBlock, type Contract } from '@/engine/contract';
import { quoteHtml } from '@/engine/quote';
import type { Estimate, Lang, Profile } from '@/engine/types';
import { currentLanguage, customLanguage, isEnglish, LANGUAGES, type Language } from '@/i18n';
import type { Dict } from '@/i18n/core';
import { TranslateError, translateDocument, translateLines, translateMessage } from '@/i18n/documents';
import { BUILT_IN, findLanguage } from '@/i18n/languages';
import { useApp } from '@/store/AppContext';

import { Field, Select } from './kit';
import { notify } from './notify';

const EN = LANGUAGES.find((l) => l.code === 'en-US')!;
const VI = LANGUAGES.find((l) => l.code === 'vi-VN')!;
const OTHER = 'other';

/** The language this job's client reads. Until it is chosen for the job: the contractor's own. */
export function clientLanguage(est: Estimate | undefined): Language {
  const c = est?.clientLang;
  if (c === 'en') return EN; // saved by earlier versions
  if (c === 'vi') return VI;
  return findLanguage(c, est?.clientLangName) ?? currentLanguage() ?? EN;
}

/** The language the engine writes the document in. Any third language is translated from the English one. */
const base = (l: Language): Lang => (l.code.startsWith('vi') ? 'vi' : 'en');
export const clientLang = (est: Estimate | undefined): Lang => base(clientLanguage(est));
/** The language to translate into, or null when the document is already in it (English, Vietnamese). */
const target = (l: Language): Language | null => (l.code.startsWith('vi') || isEnglish(l) ? null : l);

/** Tells the user why a document was not sent. Returns false for any other kind of error. */
export function translateFailed(e: unknown, l: Language | null): boolean {
  if (!(e instanceof TranslateError)) return false;
  notify(`Could not translate into ${l?.name ?? 'that language'}`, `${e.message} Try again, or set Client’s language to English.`);
  return true;
}

/**
 * What a screen needs to write to one client: the language the engine writes in, and `doc` / `message` to put the
 * finished document or text into the client's language just before it is sent.
 */
export function useClientWriter(language: Language, keepAsWritten: (string | undefined)[] = []) {
  const { aiAllowed, profile } = useApp();
  const to = target(language);
  const keep = [...keepAsWritten, profile?.companyName, profile?.contactName, profile?.phone, profile?.email];
  const allowed = () => { if (!aiAllowed) throw new TranslateError('Translating a document sends it to the AI, and AI sharing is off (Me > Bidwell AI).'); };
  return {
    language, lang: base(language), target: to,
    /** A finished document (HTML) in the client's language. Unchanged for English and Vietnamese. */
    doc: async (html: string): Promise<string> => { if (!to) return html; allowed(); return translateDocument(html, to, keep); },
    /** A whole text message or email in the client's language (Vietnamese too: these texts are written in English). */
    say: async (text: string): Promise<string> => {
      if (isEnglish(language) || (!to && !aiAllowed)) return text;
      allowed();
      return (await translateLines(language, [text]))[text] ?? text;
    },
    /** One sentence with {0}, {1}… filled in, in the client's language. */
    message: async (template: string, ...values: string[]): Promise<string> => {
      if (to) { allowed(); return translateMessage(to, template, ...values); }
      return template.replace(/\{(\d+)\}/g, (_, i: string) => values[Number(i)] ?? '');
    },
  };
}
export const useClientDocs = (est: Estimate | undefined) => useClientWriter(clientLanguage(est), [est?.clientName, est?.address, est?.title]);

/**
 * The signed quote to share again. English and Vietnamese copies were kept at signing. In a third language: the copy
 * kept at signing (a quote signed online is kept exactly as the client saw it), otherwise it is translated now.
 */
export async function signedQuoteHtml(est: Estimate, profile: Profile, signed: NonNullable<Contract['accepted']>, docs: { lang: Lang; target: Language | null; doc: (html: string) => Promise<string> }, schedule?: NonNullable<Contract['terms']>['schedule']): Promise<string> {
  const kept = (k: Lang | 'client') => { const h = signed.html?.[k]; return h ? unpackSigned(h, profile) : undefined; };
  const remade = (l: Lang) => quoteHtml(est, profile, l, acceptedBlock(signed, profile, l), undefined, schedule);
  if (!docs.target) return kept(docs.lang) ?? remade(docs.lang);
  return kept('client') ?? (signed.audit ? kept('en') : undefined) ?? docs.doc(kept('en') ?? remade('en'));
}

/**
 * Fixed wording shown to the client on the contractor's phone (the signing screen), in the client's language.
 * English until the translation arrives; `words` must be a constant list.
 */
export function useClientWords(language: Language, words: readonly string[]): (s: string) => string {
  const { aiAllowed } = useApp();
  const to = target(language);
  const [got, setGot] = useState<{ code: string; dict: Dict } | null>(null);
  const code = to?.code;
  useEffect(() => {
    if (!to || !aiAllowed) return;
    let live = true;
    translateLines(to, [...words]).then((dict) => { if (live) setGot({ code: to.code, dict }); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `to` is rebuilt each render; its code is what matters
  }, [code, aiAllowed, words]);
  return (s) => (got && got.code === code ? got.dict[s] ?? s : s);
}

/** Pick any language: the contractor's own first, then the common ones, then the rest, then "Another language". */
export function LanguageSelect({ label, value, onChange, help }: { label: string; value: Language; onChange: (l: Language) => void; help?: string }) {
  const listed = LANGUAGES.some((l) => l.code === value.code);
  const [typing, setTyping] = useState(!listed);
  const [name, setName] = useState(listed ? '' : value.name);
  const own = currentLanguage()?.code;
  const top = [...new Set([own, ...BUILT_IN].filter((c): c is string => !!c && LANGUAGES.some((l) => l.code === c)))];
  const ordered = [...top.map((c) => LANGUAGES.find((l) => l.code === c)!), ...LANGUAGES.filter((l) => !top.includes(l.code))];
  const to = target(value);
  return (
    <>
      <Select<string> label={label} value={typing ? OTHER : value.code}
        onChange={(v) => {
          if (v === OTHER) { setTyping(true); return; }
          setTyping(false);
          onChange(ordered.find((l) => l.code === v)!);
        }}
        options={[...ordered.map((l) => ({ value: l.code, label: l.name, sub: l.name !== l.english ? l.english : undefined })), { value: OTHER, label: 'Another language' }]}
        help={typing ? undefined : help ?? (to ? `Bidwell translates what you send into ${to.name}. You keep the English version.` : undefined)} />
      {typing ? (
        <Field label="Another language" value={name} placeholder="Type its name" maxLength={40} autoCorrect={false}
          onChangeText={setName} onEndEditing={() => { if (name.trim()) onChange(customLanguage(name)); }}
          help="Bidwell translates what you send into it. You keep the English version." />
      ) : null}
    </>
  );
}

/**
 * "Client’s language" for one job. The app itself follows the contractor's language; what the client receives
 * follows this, so a Vietnamese-speaking contractor can send an English quote, or a quote in any other language.
 */
export function ClientLanguage({ est }: { est: Estimate }) {
  const { updateEstimate } = useApp();
  const value = clientLanguage(est);
  return (
    <LanguageSelect label="Client’s language" value={value}
      onChange={(l) => updateEstimate(est.id, { clientLang: l.code, clientLangName: l.name })}
      help={target(value) ? undefined : 'The quote, contract and invoices for this job are written in it.'} />
  );
}
