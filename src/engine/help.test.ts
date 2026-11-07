import { describe, expect, it } from 'vitest';

import { HELP_ROUTES, HELP_TOPICS, helpSystem, parseHelpReply, searchHelp } from './help';

describe('help', () => {
  it('finds the right how-to without the AI, in English and Vietnamese', () => {
    expect(searchHelp('how do I reset my password')[0].id).toBe('password');
    expect(searchHelp('đo mái bằng vệ tinh')[0].id).toBe('roof-satellite');
    expect(searchHelp('add a change order')[0].id).toBe('change-order');
    expect(searchHelp('')).toEqual([]);
  });

  it('keeps only real screens from the assistant reply', () => {
    const p = parseHelpReply('Tap the + to start. [[open:/new]] [[open:/hack]] [[open:/new]]');
    expect(p.text).toBe('Tap the + to start.');
    expect(p.links).toEqual([{ route: '/new', label: 'New estimate' }]);
  });

  it('every topic links to a real screen and the instructions list them', () => {
    for (const t of HELP_TOPICS) expect(HELP_ROUTES[t.route]).toBeTruthy();
    const sys = helpSystem({ company: 'Upgrade Home' });
    expect(sys).toContain('Upgrade Home');
    expect(sys).toContain('Never ask for passwords');
  });
});
