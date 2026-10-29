import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanAnswers, cleanPastJob, cleanScopeResult, directClaudeAI, extractJson, getAI, hostClaudeAI, testClaudeKey, type SampleFn } from './ai';

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
    expect(body.messages[0].content[0]).toEqual({ type: 'text', text: 'Photo 1:' });
    expect(body.messages[0].content[1]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
    expect(body.system).toContain('Report only what is clearly visible');
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

describe('Claude built into claude.ai (no API key)', () => {
  it('sends notes and photos through sample and cleans the answer', async () => {
    const sample = vi.fn(async () => ({ text: 'Sure:\n{"jobTypeId":"bathroom","answers":{"floorTileSf":40,"bogus":1},"heard":["40 SF tile"],"notes":["Soft subfloor by toilet"]}', truncated: false }));
    const r = await hostClaudeAI(async () => sample as unknown as SampleFn).parseScope('hall bath 40 sf tile', 'bathroom', [{ mediaType: 'image/jpeg', base64: 'AAAA' }]);
    expect(r).toMatchObject({ source: 'claude', answers: { floorTileSf: 40 }, notes: ['Soft subfloor by toilet'] });
    expect(r.answers).not.toHaveProperty('bogus');
    const [prompt, opts] = sample.mock.calls[0] as unknown as [string, { images: Blob[] }];
    expect(prompt).toContain('floorTileSf');
    expect(opts.images[0]).toBeInstanceOf(Blob);
    expect(opts.images[0].type).toBe('image/jpeg');
  });
  it('falls back to the offline reader when Claude is not allowed or missing', async () => {
    const denied = hostClaudeAI(async () => (async () => { throw { code: 'not_granted', message: 'x' }; }) as unknown as SampleFn);
    const r = await denied.parseScope('2 new showers', 'basement');
    expect(r.source).toBe('demo');
    expect(r.answers.showers).toBe(2);
    expect(r.error).toMatch(/not allowed/);
    const none = await hostClaudeAI(async () => null).extractPastJob('Kitchen remodel 150 sf total $30,000');
    expect(none.error).toMatch(/not available/);
  });
  it('prefers your own key, then the built-in Claude', () => {
    const host = async () => null;
    expect(getAI({ apiKey: 'sk-x', host }).name).toMatch(/claude-/);
    expect(getAI({ host }).name).toBe('Claude (built in)');
  });
});

describe('Claude learns the contractor', () => {
  it('sends their own words and pricing history with the job', async () => {
    const sample = vi.fn(async () => ({ text: '{"answers":{}}', truncated: false }));
    await hostClaudeAI(async () => sample as unknown as SampleFn)
      .parseScope('re-roof 2000 sf', 'roofing', [], { about: 'I always include haul-away.', history: '4 past jobs, average $10/SF' });
    const prompt = (sample.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('I always include haul-away.');
    expect(prompt).toContain('4 past jobs, average $10/SF');
    expect(prompt).toContain('"priceUnit":"SF"');
  });
});

describe('photo findings you can check', () => {
  it('keeps photo labels in order, and marks which answers came from photos', async () => {
    const fetchMock = vi.fn(async () => reply({
      answers: { floorTileSf: 40, toilets: 1 }, sources: { floorTileSf: 'notes', toilets: 'photo', bogus: 'photo' },
      heard: [], notes: ['Photo 3: cracked tile by the tub'],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await directClaudeAI('k').parseScope('40 sf tile', 'bathroom', [
      { mediaType: 'image/jpeg', base64: 'A', label: 'Photo 1' }, { mediaType: 'image/jpeg', base64: 'B', label: 'Photo 3' },
    ]);
    expect(r.sources).toEqual({ floorTileSf: 'notes', toilets: 'photo' });
    expect(r.notes).toEqual(['Photo 3: cracked tile by the tub']);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages[0].content[2]).toEqual({ type: 'text', text: 'Photo 3:' });
    expect(body.messages[0].content.at(-1).text).toContain('in this order: Photo 1, Photo 3');
  });
  it('sends the setup interview to Claude as sentences', async () => {
    const { workSummary } = await import('./profile');
    const w = workSummary({ clients: ['investors'], jobSizes: ['50to150'], finish: 'high', subOut: ['electrical'], area: 'King County', alwaysInclude: 'permits', neverDo: 'asbestos' });
    expect(w).toContain('Investors / landlords');
    expect(w).toContain('Subs out: Electrical');
    expect(w).toContain('Never does / always excludes: asbestos.');
    const sample = vi.fn(async () => ({ text: '{"answers":{}}', truncated: false }));
    await hostClaudeAI(async () => sample as unknown as SampleFn).parseScope('x', 'kitchen', [], { work: w });
    expect((sample.mock.calls[0] as unknown as [string])[0]).toContain('setup answers');
  });
});

describe('setup answers the contractor skipped', () => {
  it('are never stated to Claude as facts', async () => {
    const { workSummary, EMPTY_WORK } = await import('./profile');
    expect(workSummary(EMPTY_WORK)).toBe('');
  });
});
