import { describe, expect, it } from 'vitest';
import { createDefaultPreset } from '@/core/defaultPreset';
import { describePatchDifferences, isSamePatch } from '@/core/samePatch';
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

describe('describePatchDifferences', () => {
  it('reports nothing for identical reads', () => {
    expect(describePatchDifferences(patch(), patch())).toEqual({ identity: [], values: [] });
  });

  it('treats a changed knob as a value difference, not an identity one', () => {
    // A successful on-pedal copy (16B -> 17D) was rejected when this counted
    // as a failure: live controls can move saved values.
    const base = patch();
    const vol = base.effects.find((effect) => effect.slotIndex === 10)!;
    const params = [...vol.params];
    params[0] = params[0] + 23;
    const result = describePatchDifferences(withBlock(base, 10, { params }), base);
    expect(result.identity).toEqual([]);
    expect(result.values).toHaveLength(1);
    expect(result.values[0]).toContain('VOL param 0');
  });

  it('treats patch volume, pan and tempo as value differences', () => {
    const result = describePatchDifferences(patch({ patchVolume: 75, patchTempo: 90 }), patch());
    expect(result.identity).toEqual([]);
    expect(result.values).toHaveLength(2);
  });

  it('treats a different name as an identity difference, naming both', () => {
    const result = describePatchDifferences(patch({ patchName: 'Spicy Bass' }), patch());
    expect(result.identity).toEqual(['name "Spicy Bass" vs "Net Red"']);
  });

  it('treats a block switched the other way as an identity difference, by module', () => {
    const base = patch();
    const wah = base.effects.find((effect) => effect.slotIndex === 1)!;
    const result = describePatchDifferences(withBlock(base, 1, { enabled: !wah.enabled }), base);
    expect(result.identity).toHaveLength(1);
    expect(result.identity[0]).toMatch(/^WAH (on|off) vs (on|off)$/);
  });
});
