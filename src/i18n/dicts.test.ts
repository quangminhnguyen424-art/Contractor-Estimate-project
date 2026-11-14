import { describe, expect, it } from 'vitest';

import catalogJson from './catalog.json';
import { createTranslator, keepsSlots, type Catalog, type Dict } from './core';
import esJson from './es.json';
import { customLanguage, findLanguage, isRtl, LANGUAGES, matchDevice, voiceTag } from './languages';
import viJson from './vi.json';

const catalog = catalogJson as Catalog;
const all = [...catalog.exact, ...catalog.patterns];

describe('the built-in languages', () => {
  it('Tiếng Việt covers the whole app', () => {
    const vi = viJson as Dict;
    const missing = all.filter((s) => vi[s] === undefined);
    // New wording added to the app shows in English until it is translated here; keep that list short.
    expect(missing.length).toBeLessThan(40);
  });

  it.each([['vi', viJson as Dict], ['es', esJson as Dict]])('%s keeps every value of every sentence', (_name, dict) => {
    const broken = Object.entries(dict).filter(([src, t]) => !keepsSlots(src, t)).map(([src]) => src);
    expect(broken).toEqual([]);
  });

  it('reads like the app in Vietnamese', () => {
    const t = createTranslator(catalog, viJson as Dict).translate;
    expect(t('New estimate')).toBe('Estimate mới');
    expect(t('3 of 5 to-dos done')).toBe('Xong 3 trên 5 việc');
    expect(t('Waiting for Mrs Kim to sign')).toBe('Đang chờ Mrs Kim ký');
    expect(t('Paid $1,200 of $16,916')).toBe('Đã trả $1,200 trên $16,916');
    expect(t('Mrs Kim · 12 Main St, Kent')).toBe('Mrs Kim · 12 Main St, Kent');
    expect(t('Evening, Minh')).toBe('Chào buổi tối, Minh');
  });

  it('the catalog holds words for people, not code', () => {
    const junk = all.filter((s) => /<[a-z/!]|^\/|^data:|\.csv$|stroke=|^sms:/i.test(s));
    expect(junk).toEqual([]);
  });
});

describe('choosing a language', () => {
  it('finds the phone’s language in the list', () => {
    expect(matchDevice('vi-VN')?.name).toBe('Tiếng Việt');
    expect(matchDevice('es-MX')?.code).toBe('es-US');
    expect(matchDevice('zh-Hant-TW')?.code).toBe('zh-TW');
    expect(matchDevice('zh_CN')?.code).toBe('zh-CN');
    expect(matchDevice('xx-XX')).toBeNull();
  });

  it('accepts a language the user types in', () => {
    const l = customLanguage('  Tiếng  Mường ');
    expect(l.name).toBe('Tiếng Mường');
    expect(voiceTag(l)).toBeUndefined();
    expect(findLanguage(l.code, l.name)?.english).toBe('Tiếng Mường');
    expect(findLanguage('ko-KR')?.english).toBe('Korean');
    expect(new Set(LANGUAGES.map((x) => x.code)).size).toBe(LANGUAGES.length);
    expect(isRtl(findLanguage('ar-SA')!)).toBe(true);
  });
});
