import { describe, expect, it, vi } from 'vitest';

import { demoAI, hostClaudeAI, type SampleFn } from './ai';
import { assistantSystem, isVietnamese, parseAssistantReply, speakable } from './assistant';
import { buildEstimate } from './estimator';
import type { Estimate, Profile } from './types';

const profile: Profile = {
  companyName: 'YM LLC', contactName: 'Minh Nguyen', phone: '', email: '', license: '', specialties: ['bathroom', 'roofing', 'small'],
  markupPct: 22, minMarkupPct: 15, salesTaxPct: 10.25, quoteValidDays: 30, quoteLanguage: 'en', schedule: [{ label: 'All', pct: 100 }],
  about: 'I sub out electrical.', work: { clients: ['investors'], jobSizes: [], finish: 'mid', subOut: [], area: 'King County', alwaysInclude: '', neverDo: '' },
};

describe('assistant instructions', () => {
  it("include the contractor's prices, history and recent estimates", () => {
    const r = buildEstimate({ jobTypeId: 'bathroom', mode: 'quick', finish: 'mid', answers: { sizeSf: 40 }, customItems: [], markupPct: 22,
      minMarkupPct: 15, salesTaxPct: 10, priceBook: { labor: {}, materials: {} }, presets: {}, pastJobs: [] });
    const est = { ...r, id: 'e', title: 'Kim bath', jobTypeId: 'bathroom', status: 'sent', updatedAt: '2026-10-20T00:00:00Z' } as unknown as Estimate;
    const s = assistantSystem({ profile, presets: { bathroom: { basic: 250, mid: 310, high: 400 } }, estimates: [est],
      pastJobs: [{ id: 'p', jobTypeId: 'bathroom', title: 'x', sizeSf: 50, price: 16000, finish: 'mid', date: '2026-01-01' }] }, new Date('2026-10-29'));
    expect(s).toContain('YM LLC');
    expect(s).toContain('Bathroom remodel (id bathroom): basic $250/SF, mid $310/SF, high $400/SF; past jobs average $320/SF (1)');
    expect(s).toContain('Roof replacement (id roofing)');
    expect(s).toContain('Kim bath · Bathroom remodel · sent · $12,000');
    expect(s).toContain('I sub out electrical.');
    expect(s).toContain('Works in: King County.');
    expect(s).toContain('[[estimate]]');
  });
});

describe('assistant replies', () => {
  it('turns an estimate block into a button and hides it from the text', () => {
    const r = parseAssistantReply('Sure, here is a start.\n[[estimate]]{"jobTypeId":"bathroom","title":"Hall bath","notes":"45 sf, tile shower"}[[/estimate]]');
    expect(r.text).toBe('Sure, here is a start.');
    expect(r.action).toEqual({ jobTypeId: 'bathroom', title: 'Hall bath', notes: '45 sf, tile shower' });
  });
  it('ignores broken or unknown blocks', () => {
    expect(parseAssistantReply('Hi [[estimate]]{bad json[[/estimate]]')).toEqual({ text: 'Hi' });
    expect(parseAssistantReply('x [[estimate]]{"jobTypeId":"spaceship","notes":"n"}[[/estimate]]').action).toBeUndefined();
  });
  it('reads aloud without symbols, in the right language', () => {
    expect(speakable('**Yes.**\n- 45 SF of tile\n- 20 LF base')).toBe('Yes. 45 square feet of tile 20 linear feet base');
    expect(isVietnamese('Lên danh sách vật tư')).toBe(true);
    expect(isVietnamese('List the materials')).toBe(false);
  });
});

describe('chat backends', () => {
  it('built-in Claude gets the instructions first, then the conversation, never cached', async () => {
    const sample = vi.fn(async () => ({ text: 'Yes, a permit is needed.', truncated: false }));
    const reply = await hostClaudeAI(async () => sample as unknown as SampleFn).chat([{ role: 'user', content: 'Permit for a water heater?' }], 'SYSTEM');
    expect(reply).toBe('Yes, a permit is needed.');
    const [input, opts] = sample.mock.calls[0] as unknown as [{ role: string; content: string }[], { cache: boolean }];
    expect(input[0]).toEqual({ role: 'user', content: 'SYSTEM' });
    expect(input[1].content).toBe('Permit for a water heater?');
    expect(opts.cache).toBe(false);
  });
  it('explains what to do when Claude is not connected', async () => {
    expect(await demoAI.chat([], '')).toMatch(/Claude is connected|add your Claude key/);
    await expect(hostClaudeAI(async () => null).chat([{ role: 'user', content: 'hi' }], 's')).rejects.toThrow(/not available/);
  });
});
