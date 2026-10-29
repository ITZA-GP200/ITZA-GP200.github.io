import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildProfile,
  importProfile,
  profileFilename,
  readSettings,
  serializeProfile,
  PROFILE_VERSION,
} from '@/core/profile';

beforeEach(() => localStorage.clear());

describe('profile: what goes in the file', () => {
  it('takes the whole gp200 namespace and nothing else', () => {
    localStorage.setItem('gp200:boardStyle', 'bar');
    localStorage.setItem('gp200:labelLum', '72');
    localStorage.setItem('unrelated', 'leave me');
    expect(readSettings()).toEqual({ 'gp200:boardStyle': 'bar', 'gp200:labelLum': '72' });
  });

  it('is byte-identical for the same settings, whatever order they were written', () => {
    localStorage.setItem('gp200:labelLum', '72');
    localStorage.setItem('gp200:boardStyle', 'bar');
    const first = serializeProfile({ ...buildProfile(), exportedAt: 'x' });
    localStorage.clear();
    localStorage.setItem('gp200:boardStyle', 'bar');
    localStorage.setItem('gp200:labelLum', '72');
    const second = serializeProfile({ ...buildProfile(), exportedAt: 'x' });
    expect(first).toBe(second);
  });

  it('names the file so it sorts and never collides', () => {
    expect(profileFilename(new Date(2026, 9, 28, 23, 12))).toBe(
      'itza-gp200-settings-2026-10-28-2312.json',
    );
  });
});

describe('profile: round trip', () => {
  it('comes back exactly as it went out', () => {
    localStorage.setItem('gp200:boardSkin', '{"3":{"color":"#7c6cf0"}}');
    localStorage.setItem('gp200:labelLum', '72');
    const file = serializeProfile(buildProfile('test'));
    localStorage.clear();
    const result = importProfile(file);
    expect(result.ok).toBe(true);
    expect(result.applied.sort()).toEqual(['gp200:boardSkin', 'gp200:labelLum']);
    expect(localStorage.getItem('gp200:labelLum')).toBe('72');
    expect(localStorage.getItem('gp200:boardSkin')).toBe('{"3":{"color":"#7c6cf0"}}');
  });

  it('merges rather than replaces: a key the file never mentions survives', () => {
    localStorage.setItem('gp200:bank64Backup', 'this morning');
    const result = importProfile(JSON.stringify({
      kind: 'itza-gp200-profile',
      version: PROFILE_VERSION,
      settings: { 'gp200:labelLum': '40' },
    }));
    expect(result.ok).toBe(true);
    expect(localStorage.getItem('gp200:bank64Backup')).toBe('this morning');
    expect(localStorage.getItem('gp200:labelLum')).toBe('40');
  });
});

describe('profile: what it refuses', () => {
  it('will not write outside the gp200 namespace', () => {
    const result = importProfile(JSON.stringify({
      kind: 'itza-gp200-profile',
      version: PROFILE_VERSION,
      settings: { 'evil': 'payload', 'gp200:labelLum': '40' },
    }));
    expect(localStorage.getItem('evil')).toBeNull();
    expect(result.skipped).toEqual([{ key: 'evil', reason: 'not an editor setting' }]);
    expect(result.applied).toEqual(['gp200:labelLum']);
  });

  it('rejects a file that is not a profile, and says so in words', () => {
    expect(importProfile('nonsense').error).toMatch(/not valid JSON/);
    // An object without our marker reaches the `kind` check, which is the
    // more specific complaint; only a non-object is rejected on shape.
    expect(importProfile('{"hello":1}').error).toMatch(/not an ITZA GP-200 settings profile/);
    expect(importProfile('[]').error).toMatch(/not a settings profile/i);
    expect(importProfile('null').error).toMatch(/not a settings profile/i);
    expect(importProfile(JSON.stringify({ kind: 'something-else' })).error)
      .toMatch(/not an ITZA GP-200 settings profile/);
  });

  it('refuses a profile from a newer build rather than half-applying it', () => {
    const result = importProfile(JSON.stringify({
      kind: 'itza-gp200-profile',
      version: PROFILE_VERSION + 1,
      settings: { 'gp200:labelLum': '40' },
    }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/newer version/);
    expect(localStorage.getItem('gp200:labelLum')).toBeNull();
  });

  it('skips a value that is not text', () => {
    const result = importProfile(JSON.stringify({
      kind: 'itza-gp200-profile',
      version: PROFILE_VERSION,
      settings: { 'gp200:labelLum': 40 },
    }));
    expect(result.skipped).toEqual([{ key: 'gp200:labelLum', reason: 'not text' }]);
    expect(localStorage.getItem('gp200:labelLum')).toBeNull();
  });
});
