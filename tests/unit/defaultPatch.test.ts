import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultPreset } from '@/core/defaultPreset';
import { DEFAULT_PATCH_NAME, loadDefaultPatch, saveDefaultPatch } from '@/core/defaultPatch';

const KEY = 'gp200:defaultPatch';

describe('default patch storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('names reset patches "Itza GP-200", distinct from the factory "It\'s GP-200"', () => {
    expect(DEFAULT_PATCH_NAME).toBe('Itza GP-200');
    expect(DEFAULT_PATCH_NAME.length).toBeLessThanOrEqual(16);
  });

  it('has no default until one is set', () => {
    expect(loadDefaultPatch()).toBeNull();
  });

  it('round-trips the slot and the patch as read', () => {
    const preset = { ...createDefaultPreset(), patchName: 'Clean Base' };
    saveDefaultPatch({ slot: 21, preset });
    const loaded = loadDefaultPatch();
    expect(loaded?.slot).toBe(21);
    expect(loaded?.preset.patchName).toBe('Clean Base');
    expect(loaded?.preset.effects).toEqual(preset.effects);
  });

  it('leaves the original file bytes out of storage', () => {
    const preset = { ...createDefaultPreset(), rawSource: new Uint8Array([1, 2, 3]) };
    saveDefaultPatch({ slot: 0, preset });
    expect(localStorage.getItem(KEY)).not.toContain('rawSource');
    expect(loadDefaultPatch()?.preset.rawSource).toBeUndefined();
  });

  it('ignores malformed or out-of-range stored values', () => {
    localStorage.setItem(KEY, '{not json');
    expect(loadDefaultPatch()).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ slot: 300, preset: createDefaultPreset() }));
    expect(loadDefaultPatch()).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ slot: 3, preset: { patchName: 'broken' } }));
    expect(loadDefaultPatch()).toBeNull();
  });
});
