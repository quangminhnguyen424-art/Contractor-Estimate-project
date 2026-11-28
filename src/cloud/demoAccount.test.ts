import { describe, expect, it } from 'vitest';

import { demoSql } from '../../scripts/demo-account.mjs';

describe('demo account: the sample jobs loaded for App Review', () => {
  const data = { estimates: [{ id: 'e1', title: "Lee's kitchen" }], projects: [] };

  it('writes one statement that loads the sample jobs into the account with that email', () => {
    const sql = demoSql('Review@Studwise.ai', data);
    expect(sql).toContain("lower(u.email) = 'review@studwise.ai'");
    expect(sql).toContain('"Lee\'s kitchen"');
    expect(sql).toContain('insert into public.workspaces');
  });
  it('never replaces an account that already has estimates or jobs', () => {
    const sql = demoSql('review@studwise.ai', data);
    expect(sql).toMatch(/on conflict \(user_id\) do update[\s\S]*jsonb_array_length\(coalesce\(public\.workspaces\.data->'estimates'[\s\S]*= 0/);
    expect(sql).toMatch(/jsonb_array_length\(coalesce\(public\.workspaces\.data->'projects'[\s\S]*= 0/);
  });
  it('refuses anything that is not a plain email address', () => {
    expect(() => demoSql("a@b.co'; drop table x; --", data)).toThrow('not an email address');
    expect(() => demoSql('', data)).toThrow('not an email address');
  });
  it('refuses sample data that could break out of the statement', () => {
    expect(() => demoSql('review@studwise.ai', { estimates: [{ note: '$demo$' }], projects: [] })).toThrow('sample data');
  });
});
