import { describe, expect, it } from 'vitest';

import { codeOf, jobCodeFor, matchCode, normCode } from './jobCode';
import type { SiteProject } from './site';

const proj = (id: string, address: string, over: Partial<SiteProject> = {}): SiteProject => ({
  id, title: 'Job', clientName: '', address, status: 'active', createdAt: '2026-11-01', rooms: [], logs: [], ...over,
});

describe('job codes', () => {
  it('makes a code from the house number', () => {
    expect(jobCodeFor('11752 20th Ave NE, Seattle', 'Kim remodel', [])).toBe('11752');
  });

  it('adds a number when the code is taken', () => {
    expect(jobCodeFor('11752 20th Ave NE', 'Kim', ['11752'])).toBe('11752-2');
    expect(jobCodeFor('11752 20th Ave NE', 'Kim', ['11752', '11752-2'])).toBe('11752-3');
  });

  it('uses the street name when there is no number, then the title', () => {
    expect(jobCodeFor('Myrtle St, Seattle', 'Flip', [])).toBe('MYRTLE');
    expect(jobCodeFor('', 'Kim bathroom remodel', [])).toBe('KIM');
    expect(jobCodeFor('', '', [])).toBe('JOB');
  });

  it('reads a code the way it is said or typed at a register', () => {
    expect(normCode(' po# 11752 ')).toBe('11752');
    expect(normCode('Job name: Myrtle')).toBe('MYRTLE');
    expect(normCode('11752-2')).toBe('117522');
  });

  it('falls back to the address for projects made before codes existed', () => {
    expect(codeOf(proj('a', '1241 SW Myrtle St'))).toBe('1241');
    expect(codeOf(proj('a', '1241 SW Myrtle St', { code: 'MYRTLE' }))).toBe('MYRTLE');
  });

  it('matches only a whole code', () => {
    const ps = [proj('a', '11752 20th Ave NE'), proj('b', 'Myrtle St', { code: 'MYRTLE' })];
    expect(matchCode('PO# 11752', ps)?.id).toBe('a');
    expect(matchCode('job: myrtle', ps)?.id).toBe('b');
    expect(matchCode('11752 KITCHEN', ps)?.id).toBe('a');
    expect(matchCode('117', ps)).toBeNull();
    expect(matchCode('1175', ps)).toBeNull();
    expect(matchCode('', ps)).toBeNull();
    expect(matchCode('117520', ps)).toBeNull();
  });

  it('does not guess between two projects with the same code, and prefers an open one over a finished one', () => {
    const twins = [proj('a', '500 Pine St'), proj('b', '500 Oak St')];
    expect(matchCode('500', twins)).toBeNull();
    const oldAndNew = [proj('a', '500 Pine St', { status: 'done' }), proj('b', '500 Oak St')];
    expect(matchCode('500', oldAndNew)?.id).toBe('b');
  });
});

describe('a saved project keeps its code', () => {
  it('survives the saved-data check, tidied', async () => {
    const { sanitizeProjects } = await import('../store/sanitize');
    const [p] = sanitizeProjects([{ id: 'p', title: 'Job', address: '1 A St', status: 'active', rooms: [], logs: [], code: ' myrtle ' }]);
    expect(p.code).toBe('MYRTLE');
    expect(sanitizeProjects([{ id: 'q', title: 'Job', rooms: [], logs: [] }])[0].code).toBeUndefined();
  });
});

describe('a new project gets a code', () => {
  it('from its address, avoiding codes already in use', async () => {
    const { projectFromEstimate } = await import('./site');
    const est = { id: 'e', title: 'Kim remodel', clientName: 'Kim', address: '11752 20th Ave NE, Seattle' } as never;
    expect(projectFromEstimate(est, 'Remodel', 'p', () => 'r').code).toBe('11752');
    expect(projectFromEstimate(est, 'Remodel', 'p', () => 'r', ['11752']).code).toBe('11752-2');
  });
});
