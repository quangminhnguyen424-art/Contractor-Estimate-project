import { describe, expect, it } from 'vitest';

import { applyHtml, documentPrompt, htmlTexts, keepsNumbers, readDocument } from './documentText';

const html = `<!doctype html><html lang="en"><head><title>Quote 1</title><style>body{color:red} .x{content:"Hello there"}</style></head><body>
<h1>Upgrade Home</h1><div class="muted">Minh Nguyen · 253-555-0100 · a@b.co</div>
<h2>Scope of work</h2><table><tr><td>Demo &amp; haul away</td><td class="r">$1,907</td></tr>
<tr><td>Mrs Kim</td><td>12 Main St, Kent</td></tr></table>
<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/><text>Signed here</text></svg>
<p>Deposit of 10% ($1,538) is due at signing.</p><p>Deposit of 10% ($1,538) is due at signing.</p></body></html>`;

describe('client documents in another language', () => {
  it('collects the lines a person reads, once each, and nothing else', () => {
    const texts = htmlTexts(html, ['Mrs Kim', '12 Main St, Kent', 'Upgrade Home']);
    expect(htmlTexts('<p>· 12 Main St, Kent</p><p>Mrs Kim · 12 Main St, Kent</p>', ['Mrs Kim', '12 Main St, Kent'])).toEqual([]);
    expect(texts).toEqual(['Minh Nguyen · 253-555-0100 · a@b.co', 'Scope of work', 'Demo & haul away', 'Deposit of 10% ($1,538) is due at signing.']);
  });

  it('puts the translation back in place and leaves the rest of the document alone', () => {
    const out = applyHtml(html, { 'Scope of work': 'Phạm vi <A&B>', 'Demo & haul away': '철거 및 반출' }, { rtl: true, lang: 'ko-KR', note: 'Note' });
    expect(out).toContain('<h2>Phạm vi &lt;A&amp;B&gt;</h2>');
    expect(out).toContain('<td>철거 및 반출</td><td class="r">$1,907</td>');
    expect(out).toContain('<html lang="ko-KR"');
    expect(out).toContain('<body dir="rtl">');
    expect(out).toContain('Note</p></body>');
    expect(out).toContain('.x{content:"Hello there"}'); // style sheets are not text
    expect(out).toContain('<text>Signed here</text>'); // nor drawings
    expect(out).toContain('<td>Mrs Kim</td>');
  });

  it('never lets a number change in translation', () => {
    expect(keepsNumbers('Deposit of 10% ($1,538) is due', 'Đặt cọc 10% ($1,538) khi ký')).toBe(true);
    expect(keepsNumbers('Total $16,916', 'Gesamt 16.916 $')).toBe(true); // same number, written the local way
    expect(keepsNumbers('Total $16,916', 'Total $16,961')).toBe(false);
    expect(keepsNumbers('Valid 30 days', 'Valable trente jours')).toBe(false);
    expect(keepsNumbers('Nov 13, 2026', '2026년 11월 13일')).toBe(true); // a month may become a number
    expect(keepsNumbers('2 coats, 2 rooms', '2 capas, habitaciones')).toBe(false);
  });

  it('reads the reply and drops lines that lost a number or a placeholder', () => {
    const src = ['Scope of work', 'Total $500', '{0}: your quote for {1} is ready: {2}'];
    expect(readDocument(src, 'Sure!\n["Alcance", "Total $50", "{0}: su cotización para {1} está lista: {2}"]')).toEqual({
      'Scope of work': 'Alcance', '{0}: your quote for {1} is ready: {2}': '{0}: su cotización para {1} está lista: {2}',
    });
    expect(readDocument(src, '["only one"]')).toEqual({});
    expect(readDocument(src, 'not json')).toEqual({});
    expect(documentPrompt('Korean', src)).toContain('into Korean');
  });
});
