import { describe, expect, it } from 'vitest';

import { decide } from './decide';

const t = (iso: string) => Date.parse(iso);
const meta = { uid: 'u', remoteAt: '2026-11-04T10:00:00.000Z', syncedChange: t('2026-11-04T10:00:00Z') };

describe('cloud sync decisions', () => {
  it('sends the phone data when the cloud is empty, does nothing when both are', () => {
    expect(decide({ uid: 'u', meta: null, remote: null, localChange: 1, localEmpty: false })).toBe('push');
    expect(decide({ uid: 'u', meta: null, remote: null, localChange: 0, localEmpty: true })).toBe('none');
  });
  it('takes the cloud copy on an empty phone or when the phone holds another account', () => {
    expect(decide({ uid: 'u', meta: null, remote: { updatedAt: '2026-01-01T00:00:00Z' }, localChange: t('2026-11-01T00:00:00Z'), localEmpty: true })).toBe('pull');
    expect(decide({ uid: 'u', meta: { ...meta, uid: 'other' }, remote: { updatedAt: '2026-01-01T00:00:00Z' }, localChange: t('2026-11-05T00:00:00Z'), localEmpty: false })).toBe('pull');
  });
  it('a phone that never synced takes the account’s saved work, never replaces it', () => {
    expect(decide({ uid: 'u', meta: null, remote: { updatedAt: '2026-11-01T00:00:00Z' }, localChange: t('2026-11-03T00:00:00Z'), localEmpty: false })).toBe('pull');
    expect(decide({ uid: 'u', meta: null, remote: { updatedAt: '2026-11-05T00:00:00Z' }, localChange: t('2026-11-03T00:00:00Z'), localEmpty: false })).toBe('pull');
    expect(decide({ uid: 'u', meta: null, remote: null, localChange: t('2026-11-03T00:00:00Z'), localEmpty: false })).toBe('push');
  });
  it('another account’s work on the phone is never sent: it is cleared when this account has nothing yet', () => {
    expect(decide({ uid: 'u', meta: { ...meta, uid: 'other' }, remote: null, localChange: t('2026-11-03T00:00:00Z'), localEmpty: false })).toBe('wipe');
    expect(decide({ uid: 'u', meta: { ...meta, uid: 'other' }, remote: null, localChange: 0, localEmpty: true })).toBe('none');
  });
  it('one side changed: that side wins; neither: nothing', () => {
    expect(decide({ uid: 'u', meta, remote: { updatedAt: '2026-11-04T12:00:00.000Z' }, localChange: meta.syncedChange, localEmpty: false })).toBe('pull');
    expect(decide({ uid: 'u', meta, remote: { updatedAt: meta.remoteAt }, localChange: t('2026-11-04T11:00:00Z'), localEmpty: false })).toBe('push');
    expect(decide({ uid: 'u', meta, remote: { updatedAt: meta.remoteAt }, localChange: meta.syncedChange, localEmpty: false })).toBe('none');
  });
  it('both changed: the two copies are joined', () => {
    expect(decide({ uid: 'u', meta, remote: { updatedAt: '2026-11-04T12:00:00.000Z' }, localChange: t('2026-11-04T13:00:00Z'), localEmpty: false })).toBe('merge');
    expect(decide({ uid: 'u', meta, remote: { updatedAt: '2026-11-04T14:00:00.000Z' }, localChange: t('2026-11-04T13:00:00Z'), localEmpty: false })).toBe('merge');
  });
});
