import { SysExCodec } from './SysExCodec';
import type { GP200Preset } from './types';

/** One copied patch: where it was read from, and what was read. */
export interface ClipItem {
  slot: number;
  preset: GP200Preset;
}

/** The pedal operation a paste needs (useMidiDevice provides it). */
export interface PasteDevice {
  /** On-pedal copy, verified by read-back; throws SourceChangedError when
   *  `copied` no longer matches the source. */
  copySlotOnDevice(fromSlot: number, toSlot: number, copied: GP200Preset): Promise<GP200Preset>;
}

const LAST_SLOT = 255;
const label = (slot: number) => SysExCodec.slotToLabel(slot);

/** "3A" or "3A–3D": the slots a paste of `count` patches at `target` covers. */
export function describeRange(target: number, count: number): string {
  if (count <= 1) return label(target);
  return `${label(target)}–${label(target + count - 1)}`;
}

/**
 * Why pasting the copied `sources` starting at `target` can't run, or null
 * when it can. The copied patches land in order in consecutive slots.
 */
export function pasteProblem(sources: number[], target: number): string | null {
  const count = sources.length;
  if (count === 0) return 'Copy a patch first';
  if (target + count - 1 > LAST_SLOT) {
    return `Not enough room: ${count} patches from ${label(target)} would run past 64D`;
  }
  if (count > 1) {
    const covered = new Set(Array.from({ length: count }, (_, i) => target + i));
    if (sources.some((slot) => covered.has(slot))) {
      return `Pasting at ${describeRange(target, count)} would overwrite the copied patches; pick a slot outside them`;
    }
  }
  return null;
}

export interface PasteProgress {
  onProgress?: (done: number, total: number) => void;
  /** Checked before each copy; true stops the paste there. */
  shouldStop?: () => boolean;
}

export interface PasteResult {
  /** Copies that finished and were verified. */
  done: number;
  /** What the last verified target holds (the pedal sits there), or null. */
  last: GP200Preset | null;
  stopped: boolean;
}

/**
 * Paste the clipboard onto consecutive slots from `target`, one verified
 * on-pedal copy at a time, in clipboard order. Stops at the first failure
 * with an error saying what was pasted and what is untouched; a stop request
 * ends it cleanly between copies.
 */
export async function pasteMany(
  device: PasteDevice,
  items: ClipItem[],
  target: number,
  progress: PasteProgress = {},
): Promise<PasteResult> {
  const problem = pasteProblem(items.map((item) => item.slot), target);
  if (problem) throw new Error(problem);

  let last: GP200Preset | null = null;
  for (let i = 0; i < items.length; i++) {
    if (progress.shouldStop?.()) return { done: i, last, stopped: true };
    const from = items[i].slot;
    const to = target + i;
    try {
      last = await device.copySlotOnDevice(from, to, items[i].preset);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const pasted = i === 0 ? 'Nothing pasted' : `Pasted ${describeRange(target, i)}`;
      const rest = i + 1 < items.length ? `; ${describeRange(to + 1, items.length - i - 1)} unchanged` : '';
      throw new Error(`${detail}. ${pasted}; stopped at ${label(from)} → ${label(to)}${rest}`, { cause: err });
    }
    progress.onProgress?.(i + 1, items.length);
  }
  return { done: items.length, last, stopped: false };
}
