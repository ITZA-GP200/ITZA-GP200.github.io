import { getSlotModule } from './effectNames';
import type { GP200Preset } from './types';

/**
 * Comparing two reads of a patch, split by what a difference means.
 *
 * `identity` is what a save that was discarded or went to the wrong slot
 * would get wrong: the name, and which effect each block holds and whether
 * it is on. `values` are knob positions and patch volume / pan / tempo.
 *
 * The split matters for an on-pedal copy: the pedal saves its live edit
 * buffer, where values under live control (an expression pedal driving VOL or
 * WAH, for instance) can legitimately differ from the stored source. Hardware
 * showed a successful copy rejected by an exact comparison (16B -> 17D).
 */
export interface PatchDifferences {
  identity: string[];
  values: string[];
}

export function describePatchDifferences(actual: GP200Preset, expected: GP200Preset): PatchDifferences {
  const identity: string[] = [];
  const values: string[] = [];

  if (actual.patchName.trim() !== expected.patchName.trim()) {
    identity.push(`name "${actual.patchName.trim()}" vs "${expected.patchName.trim()}"`);
  }
  if (actual.patchVolume !== expected.patchVolume) {
    values.push(`patch volume ${actual.patchVolume} vs ${expected.patchVolume}`);
  }
  if (actual.patchPan !== expected.patchPan) {
    values.push(`patch pan ${actual.patchPan} vs ${expected.patchPan}`);
  }
  if (actual.patchTempo !== expected.patchTempo) {
    values.push(`tempo ${actual.patchTempo} vs ${expected.patchTempo}`);
  }

  for (const want of expected.effects) {
    const module = getSlotModule(want.slotIndex);
    const got = actual.effects.find((effect) => effect.slotIndex === want.slotIndex);
    if (!got) {
      identity.push(`${module} block missing`);
      continue;
    }
    if (got.effectId !== want.effectId) {
      identity.push(`${module} effect 0x${got.effectId.toString(16)} vs 0x${want.effectId.toString(16)}`);
    }
    if (got.enabled !== want.enabled) {
      identity.push(`${module} ${got.enabled ? 'on' : 'off'} vs ${want.enabled ? 'on' : 'off'}`);
    }
    const count = Math.max(got.params.length, want.params.length);
    for (let index = 0; index < count; index++) {
      // Object.is so NaN parameter values don't read as a difference.
      if (!Object.is(got.params[index], want.params[index])) {
        values.push(`${module} param ${index} ${got.params[index]} vs ${want.params[index]}`);
      }
    }
  }

  return { identity, values };
}

/** Whether two reads hold exactly the same patch, values included. */
export function isSamePatch(a: GP200Preset, b: GP200Preset): boolean {
  const { identity, values } = describePatchDifferences(a, b);
  return identity.length === 0 && values.length === 0;
}
