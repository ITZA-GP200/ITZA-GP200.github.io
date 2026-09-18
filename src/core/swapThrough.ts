import { SourceChangedError } from './samePatch';
import { SysExCodec } from './SysExCodec';
import type { GP200Preset } from './types';

/** The pedal operations a swap needs (useMidiDevice provides them). */
export interface SwapDevice {
  pullPreset(slot: number): Promise<GP200Preset>;
  /** On-pedal copy, verified by read-back; throws SourceChangedError when
   *  `copied` no longer matches the source. */
  copySlotOnDevice(fromSlot: number, toSlot: number, copied: GP200Preset): Promise<GP200Preset>;
}

export interface SwapRequest {
  first: number;
  second: number;
  /** The user's swap slot; null when none is set. */
  scratch: number | null;
  /** What was read from `first` earlier (PASTE ▸ SWAP passes the clipboard),
   *  so a changed source refuses instead of swapping something else. */
  expectedFirst?: GP200Preset;
}

const label = (slot: number) => SysExCodec.slotToLabel(slot);

/**
 * Exchange two slots on the pedal through a scratch slot. The pedal can only
 * copy one slot onto another, so one patch has to wait somewhere: three
 * verified on-pedal copies, second -> scratch, first -> second,
 * scratch -> first. Whatever the scratch slot held is overwritten.
 *
 * Both patches are read before anything is written, so a failed read leaves
 * the pedal untouched. Once writing has begun, an error says where the
 * displaced patch is, so nothing is ever lost without the user knowing where
 * it went. Resolves with what `first` holds at the end (the pedal sits there).
 */
export async function swapThroughScratch(device: SwapDevice, request: SwapRequest): Promise<GP200Preset> {
  const { first, second, scratch, expectedFirst } = request;
  if (scratch === null) {
    throw new Error('Set a swap slot first: right-click a spare slot, then USE FOR SWAP SLOT');
  }
  if (first === second) throw new Error('Pick two different slots to swap');
  if (scratch === first || scratch === second) {
    throw new Error(`The swap slot (${label(scratch)}) can’t take part in a swap`);
  }

  const firstPatch = expectedFirst ?? await device.pullPreset(first);
  const secondPatch = await device.pullPreset(second);

  // 1. Park the second patch in the scratch slot.
  const parked = await device.copySlotOnDevice(second, scratch, secondPatch);

  // 2. First -> second.
  try {
    await device.copySlotOnDevice(first, second, firstPatch);
  } catch (err) {
    // A changed source is caught before anything is written to `second`.
    if (err instanceof SourceChangedError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${detail}. ${label(second)}’s patch is safe in the swap slot ${label(scratch)}`);
  }

  // 3. The parked patch -> first.
  try {
    return await device.copySlotOnDevice(scratch, first, parked);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${detail}. ${label(first)}’s patch is now in ${label(second)}, and ${label(second)}’s is in the `
      + `swap slot ${label(scratch)}`,
    );
  }
}
