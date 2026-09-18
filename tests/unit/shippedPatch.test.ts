import { describe, expect, it } from 'vitest';
import { getEffectName } from '@/core/effectNames';
import { loadShippedPatch } from '@/core/shippedPatch';

describe('loadShippedPatch', () => {
  it('decodes the shipped factory-settings patch', () => {
    const patch = loadShippedPatch();
    expect(patch.patchName).toBe("It's GP-200");
    expect(patch.effects).toHaveLength(11);
    // Print what ships, so a change to the file shows up in review.
    console.log(patch.effects.map((effect) => `${effect.slotIndex}:${getEffectName(effect.effectId)}:${effect.enabled ? 'on' : 'off'}`).join(' '));
  });

  it('returns a fresh copy each time', () => {
    const first = loadShippedPatch();
    first.patchName = 'changed';
    expect(loadShippedPatch().patchName).not.toBe('changed');
  });
});
