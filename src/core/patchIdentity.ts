import type { GP200Preset } from './types';

/**
 * Deciding whether a slot holds the patch a write intended, from a read-back.
 *
 * The pedal has silently discarded writes before (an upload path it refuses,
 * a save-commit missing a required field), so every Patch Manager write reads
 * its slot back and checks it with these. They are also how a paste decides
 * whether the clipboard's source slot still holds the copied patch.
 */

/** Slot names are a 16-byte field that reads back trimmed; compare them that way. */
export function sameSlotName(first: string, second: string): boolean {
  return first.slice(0, 16).trim() === second.slice(0, 16).trim();
}

/**
 * Whether `actual` is the patch `expected` describes: same name, and every
 * block carries the same effect with the same on/off state.
 *
 * Parameter values are deliberately not compared. A patch written by live
 * push travels through the device as float param writes, so exact equality
 * with the source's floats would reject writes that worked; a discarded or
 * misdirected write shows up in the name or the block layout instead.
 */
export function samePatchContent(actual: GP200Preset, expected: GP200Preset): boolean {
  if (!sameSlotName(actual.patchName, expected.patchName)) return false;
  for (const want of expected.effects) {
    const got = actual.effects.find((effect) => effect.slotIndex === want.slotIndex);
    if (!got) return false;
    if (got.effectId !== want.effectId || got.enabled !== want.enabled) return false;
  }
  return true;
}
