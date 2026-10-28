import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanAnswers, cleanPastJob, cleanScopeResult, directClaudeAI, extractJson, getAI, testClaudeKey } from './ai';

const reply = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(status === 200 ? { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } : obj), {
    status, headers: { 'content-type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('cleaning Claude output', () => {
  it('keeps only real questions with valid values', () => {
    const a = cleanAnswers('basement', {
      newWallLf: '1,200', showers: 2, washer: 'yes', foundation: 'basement', egress: 'maybe',
      bogus: 5, lights: -3, doors: 'five', panelDistanceFt: 9000,
    });
    expect(a).toEqual({ newWallLf: 1200, showers: 2, washer: true, foundation: 'basement' });
  });
  it('ignores an unknown job type and junk lists', () => {
    const r = cleanScopeResult({ jobTypeId: 'spaceship', answers: { sizeSf: 10 }, heard: ['ok', 3, ''], notes: 'x' });
    expect(r).toMatchObject({ jobTypeId: undefined, answers: {}, heard: ['ok'], notes: [] });
  });
  it('reads JSON wrapped in prose or code fences', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson('no json here')).toThrow();
  });
  it('cleans past jobs', () => {
    expect(cleanPastJob({ jobTypeId: 'kitchen', sizeSf: 150, price: '9000', finish: 'luxury', title: 'K' }))
      .toEqual({ jobTypeId: 'kitchen', sizeSf: 150, price: undefined, finish: undefined, title: 'K' });
  });
});

describe('direct Claude calls', () => {
  it('sends notes, questions and photos, and returns cleaned answers and notes', async () => {
    const fetchMock = vi.fn(async () => reply({
      jobTypeId: 'bathroom', answers: { showerType: 'tile', floorTileSf: 40, gfci: 1 },
      heard: ['tiled shower', '40 SF floor tile'], notes: ['Water stain on ceiling below the tub'],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await directClaudeAI('sk-test').parseScope('hall bath, tile shower', 'bathroom', [{ mediaType: 'image/jpeg', base64: 'AAAA' }]);
    expect(r).toMatchObject({ source: 'claude', answers: { showerType: 'tile', floorTileSf: 40, gfci: 1 }, notes: ['Water stain on ceiling below the tub'] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
    expect(body.messages[0].content.at(-1).text).toContain('showerType');
  });
  it('falls back to the offline reader with a clear message on a bad key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ error: { message: 'invalid x-api-key' } }, 401)));
    const r = await directClaudeAI('bad').parseScope('2 new showers', 'basement');
    expect(r.source).toBe('demo');
    expect(r.answers.showers).toBe(2);
    expect(r.error).toMatch(/not valid/);
    expect(await testClaudeKey('bad')).toMatch(/not valid/);
  });
  it('reports running out of credit and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ error: { message: 'Your credit balance is too low' } }, 400)));
    expect(await testClaudeKey('k')).toMatch(/out of credit/);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await testClaudeKey('k')).toMatch(/internet/);
  });
  it('uses Claude only when a key is set', () => {
    expect(getAI({ apiKey: 'sk-x' }).name).toMatch(/Claude/);
    expect(getAI({ apiKey: '  ' }).name).toMatch(/Demo/);
  });
});
