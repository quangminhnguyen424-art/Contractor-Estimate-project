import { describe, expect, it } from 'vitest';

import { createTranslator, keepsSlots, readTranslations, translationPrompt, type Catalog } from './core';

const catalog: Catalog = {
  exact: ['Draft', 'Sent', 'Take photos', 'the client'],
  patterns: ['{0} of {1} to-dos done', '{0} photo', '{0} photos', 'Waiting for {0} to sign', '{0} · {1}', 'Paid {0} of {1}', 'Stage: {0}'],
};
const vi = {
  Draft: 'Nháp', Sent: 'Đã gửi', 'Take photos': 'Chụp ảnh', 'the client': 'khách',
  '{0} of {1} to-dos done': 'Xong {0}/{1} việc', '{0} photo': '{0} ảnh', '{0} photos': '{0} ảnh',
  'Waiting for {0} to sign': 'Đang chờ {0} ký', 'Paid {0} of {1}': 'Đã trả {0} trên {1}', 'Stage: {0}': 'Giai đoạn: {0}',
};

describe('translating the app’s wording as it is drawn', () => {
  const t = createTranslator(catalog, vi).translate;

  it('translates the app’s own texts and leaves the user’s content alone', () => {
    expect(t('Take photos')).toBe('Chụp ảnh');
    expect(t('Mrs Kim — Bathroom remodel')).toBe('Mrs Kim — Bathroom remodel');
    expect(t('12 Main St, Kent')).toBe('12 Main St, Kent');
    expect(t('$16,916')).toBe('$16,916');
  });

  it('fills values into sentences, wherever the language puts them', () => {
    expect(t('3 of 5 to-dos done')).toBe('Xong 3/5 việc');
    expect(t('Paid $1,200 of $16,916')).toBe('Đã trả $1,200 trên $16,916');
    expect(t('1 photo')).toBe('1 ảnh');
    expect(t('12 photos')).toBe('12 ảnh');
  });

  it('translates a value that is itself app wording, and keeps names', () => {
    expect(t('Stage: Draft')).toBe('Giai đoạn: Nháp');
    expect(t('Waiting for the client to sign')).toBe('Đang chờ khách ký');
    expect(t('Waiting for Mrs Kim to sign')).toBe('Đang chờ Mrs Kim ký');
  });

  it('translates the pieces of a line that is glued together', () => {
    expect(t('Draft · 3 photos · Mrs Kim')).toBe('Nháp · 3 ảnh · Mrs Kim');
    expect(t('Sent, Minh')).toBe('Đã gửi, Minh');
    expect(t('12 Main St, Kent')).toBe('12 Main St, Kent');
  });

  it('keeps the spaces around a piece of a sentence', () => {
    expect(t('Take photos ')).toBe('Chụp ảnh ');
    expect(t('  Draft')).toBe('  Nháp');
  });

  it('shows English and asks for the translation when one is missing', () => {
    const asked: string[] = [];
    const some = createTranslator(catalog, { Draft: 'Nháp' }, (s) => asked.push(s)).translate;
    expect(some('Sent')).toBe('Sent');
    expect(some('2 photos')).toBe('2 photos');
    expect(some('Kim’s notes')).toBe('Kim’s notes');
    expect(asked).toEqual(['Sent', '{0} photos']);
    // A line whose own pattern is not translated yet still gets its known pieces.
    expect(some('Draft · Mrs Kim')).toBe('Nháp · Mrs Kim');
  });

  it('never asks about a pattern with no translation twice in a row for different values', () => {
    const asked: string[] = [];
    const some = createTranslator(catalog, {}, (s) => asked.push(s)).translate;
    some('2 photos'); some('3 photos'); some('2 photos');
    expect(asked).toEqual(['{0} photos', '{0} photos']);
  });
});

describe('reading translations back from the AI', () => {
  it('accepts a clean answer and drops lines that lose a value', () => {
    const src = ['Draft', 'Paid {0} of {1}', '{0} photos'];
    expect(readTranslations(src, 'Here you go:\n["Nháp", "Đã trả {0} trên {1}", "ảnh"]')).toEqual({ Draft: 'Nháp', 'Paid {0} of {1}': 'Đã trả {0} trên {1}' });
    expect(readTranslations(src, '["Nháp"]')).toEqual({});
    expect(readTranslations(src, 'sorry')).toEqual({});
  });

  it('checks placeholders', () => {
    expect(keepsSlots('{0} of {1}', '{1} 中的 {0}')).toBe(true);
    expect(keepsSlots('{0} of {1}', '{0}')).toBe(false);
    expect(translationPrompt('Korean', ['Draft'])).toContain('["Draft"]');
  });
});
