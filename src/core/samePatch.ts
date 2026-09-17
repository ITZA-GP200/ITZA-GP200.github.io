import type { GP200Preset } from './types';

/**
 * Whether two reads hold the same stored patch: same name, the same patch
 * volume / pan / tempo, and every block with the same effect, on/off state
 * and parameter values.
 *
 * Used by paste on both sides of an on-pedal copy: to confirm the source slot
 * still holds what COPY read, and that the target now holds exactly that.
 * Both are full reads of flash, so an exact comparison is the right one.
 * `Object.is` keeps NaN parameter values from reading as a mismatch.
 */
export function isSamePatch(a: GP200Preset, b: GP200Preset): boolean {
  if (a.patchName.trim() !== b.patchName.trim()) return false;
  if (a.patchVolume !== b.patchVolume) return false;
  if (a.patchPan !== b.patchPan) return false;
  if (a.patchTempo !== b.patchTempo) return false;
  if (a.effects.length !== b.effects.length) return false;
  return b.effects.every((want) => {
    const got = a.effects.find((effect) => effect.slotIndex === want.slotIndex);
    if (!got) return false;
    if (got.effectId !== want.effectId || got.enabled !== want.enabled) return false;
    if (got.params.length !== want.params.length) return false;
    return want.params.every((value, index) => Object.is(got.params[index], value));
  });
}
