import { describe, expect, it } from 'vitest';
import { createDefaultPreset } from '@/core/defaultPreset';
import { samePatchContent, sameSlotName } from '@/core/patchIdentity';
import type { GP200Preset } from '@/core/types';

function patch(overrides: Partial<GP200Preset> = {}): GP200Preset {
  return { ...createDefaultPreset(), patchName: 'Net Red', ...overrides };
}

describe('sameSlotName', () => {
  it('ignores surrounding whitespace, as names read back trimmed', () => {
    expect(sameSlotName('Net Red  ', 'Net Red')).toBe(true);
  });

  it('only compares the 16 characters the slot can hold', () => {
    expect(sameSlotName('ABCDEFGHIJKLMNOPQRS', 'ABCDEFGHIJKLMNOP')).toBe(true);
  });

  it('tells different names apart', () => {
    expect(sameSlotName('Net Red', 'Spicy Bass')).toBe(false);
  });
});

describe('samePatchContent', () => {
  it('accepts an identical patch', () => {
    expect(samePatchContent(patch(), patch())).toBe(true);
  });

  it('rejects a different name, the usual sign of a discarded write', () => {
    expect(samePatchContent(patch({ patchName: 'Spicy Bass' }), patch())).toBe(false);
  });

  it('rejects a block with a different effect', () => {
    const changed = patch();
    changed.effects = changed.effects.map((effect) =>
      effect.slotIndex === 2 ? { ...effect, effectId: effect.effectId + 1 } : effect);
    expect(samePatchContent(changed, patch())).toBe(false);
  });

  it('rejects a block switched the other way', () => {
    const changed = patch();
    changed.effects = changed.effects.map((effect) =>
      effect.slotIndex === 1 ? { ...effect, enabled: !effect.enabled } : effect);
    expect(samePatchContent(changed, patch())).toBe(false);
  });

  it('ignores parameter values, which a live push can round', () => {
    const rounded = patch();
    rounded.effects = rounded.effects.map((effect) => ({
      ...effect,
      params: effect.params.map((value) => value + 0.0001),
    }));
    expect(samePatchContent(rounded, patch())).toBe(true);
  });

  it('matches blocks by their fixed slot index, not array order', () => {
    const reordered = patch();
    reordered.effects = [...reordered.effects].reverse();
    expect(samePatchContent(reordered, patch())).toBe(true);
  });
});
