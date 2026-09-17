import { describe, expect, it } from 'vitest';
import { createDefaultPreset } from '@/core/defaultPreset';
import { isSamePatch } from '@/core/samePatch';
import type { GP200Preset } from '@/core/types';

function patch(overrides: Partial<GP200Preset> = {}): GP200Preset {
  return { ...createDefaultPreset(), patchName: 'Net Red', ...overrides };
}

function withBlock(base: GP200Preset, slotIndex: number, change: Partial<GP200Preset['effects'][number]>) {
  return {
    ...base,
    effects: base.effects.map((effect) => (effect.slotIndex === slotIndex ? { ...effect, ...change } : effect)),
  };
}

describe('isSamePatch', () => {
  it('matches two reads of the same patch', () => {
    expect(isSamePatch(patch(), patch())).toBe(true);
  });

  it('ignores trailing spaces in the name, which reads trim', () => {
    expect(isSamePatch(patch({ patchName: 'Net Red  ' }), patch())).toBe(true);
  });

  it('tells a different name apart', () => {
    expect(isSamePatch(patch({ patchName: 'Spicy Bass' }), patch())).toBe(false);
  });

  it('tells a patch-level volume change apart', () => {
    expect(isSamePatch(patch({ patchVolume: 75 }), patch())).toBe(false);
  });

  it('tells a block switched the other way apart', () => {
    const base = patch();
    const wah = base.effects.find((effect) => effect.slotIndex === 1)!;
    expect(isSamePatch(withBlock(base, 1, { enabled: !wah.enabled }), base)).toBe(false);
  });

  it('tells a different effect in a block apart', () => {
    const base = patch();
    const od = base.effects.find((effect) => effect.slotIndex === 2)!;
    expect(isSamePatch(withBlock(base, 2, { effectId: od.effectId + 1 }), base)).toBe(false);
  });

  it('tells a changed knob apart', () => {
    const base = patch();
    const amp = base.effects.find((effect) => effect.slotIndex === 3)!;
    const params = [...amp.params];
    params[0] = params[0] + 1;
    expect(isSamePatch(withBlock(base, 3, { params }), base)).toBe(false);
  });

  it('matches blocks by their fixed slot index, not their order', () => {
    const base = patch();
    expect(isSamePatch({ ...base, effects: [...base.effects].reverse() }, base)).toBe(true);
  });

  it('treats NaN parameters as equal to themselves', () => {
    const base = patch();
    const eq = base.effects.find((effect) => effect.slotIndex === 6)!;
    const params = [...eq.params];
    params[1] = Number.NaN;
    const withNaN = withBlock(base, 6, { params });
    expect(isSamePatch(withNaN, withBlock(base, 6, { params: [...params] }))).toBe(true);
  });
});
