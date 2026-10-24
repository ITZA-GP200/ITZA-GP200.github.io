import { SysExCodec } from './SysExCodec';
import { describeWriteFidelity, knobDifferenceList, type KnobDifference } from './writeFidelity';
import { loadStubbornValues, rememberStubbornValues } from './stubbornValues';
import type { GP200Preset } from './types';

/**
 * PROTECT 64: bank 64 set aside for the app. Every slot gets the patch shipped
 * with the app (core/shippedPatch.ts); 64C becomes the default and 64D the
 * swap slot. While it's
 * protected, operations that push patches along the list treat 63D as the
 * last slot, so nothing is ever pushed into bank 64 (or off the end). Direct
 * actions on a bank-64 slot still work. Only the on/off flag is stored, in
 * this browser's localStorage; storage failures degrade to "not protected".
 */

export const PROTECTED_DEFAULT_SLOT = 254; // 64C
export const PROTECTED_SWAP_SLOT = 255; // 64D
export const SWAP_SLOT_NAME = 'SWAP SLOT';
/** The last slot list-shifting operations may touch while bank 64 is protected. */
export const LAST_UNPROTECTED_SLOT = 251; // 63D

/** The default patch's fixed name in 64C. */
export const DEFAULT_SLOT_NAME = 'ITZA GP-200';

/**
 * What PROTECT 64 writes, slot by slot, and each slot's fixed name while the
 * bank is protected (named by the project owner). 64A/64B are utility slots
 * for trying settings next to the default; 64C is the default RESET copies;
 * 64D is the swap slot.
 */
export const PROTECTED_LAYOUT: readonly { slot: number; name: string }[] = [
  { slot: 252, name: 'UTILITY-1' },
  { slot: 253, name: 'UTILITY-2' },
  { slot: PROTECTED_DEFAULT_SLOT, name: DEFAULT_SLOT_NAME },
  { slot: PROTECTED_SWAP_SLOT, name: SWAP_SLOT_NAME },
];

export const isProtectedSlot = (slot: number) => slot > LAST_UNPROTECTED_SLOT;

/** A protected slot's fixed name, or undefined outside bank 64. */
export function protectedNameFor(slot: number): string | undefined {
  return PROTECTED_LAYOUT.find((entry) => entry.slot === slot)?.name;
}

const STORAGE_KEY = 'gp200:protect64';

export function loadBankProtected(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveBankProtected(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: protection just won't persist across reloads.
  }
}

/**
 * Write a patch from app data into a slot and check it against what was
 * sent. A wrong name or effect type fails at once (`problem` builds that
 * message). If only knob values are off, just those controls are sent again
 * (a second or two, see retouchParams) rather than the whole patch (10-20 s);
 * any still off after that are added to `missed` ("64A PRE param 3 10 vs 0")
 * rather than failing: on hardware COMP's Clipping stays at its default 10
 * whatever is sent once COMP is freshly loaded, so a value the pedal won't
 * accept must not stop a whole restore. Returns the read-back.
 */
export async function writeChecked(
  device: CheckedWriteDevice,
  sent: GP200Preset,
  slot: number,
  problem: (differences: string) => string,
  missed: string[] = [],
  /** Controls this pedal has already refused (see stubbornValues). Nothing is
   *  re-sent for those: the second attempt only ever confirmed what was
   *  already known. */
  stubborn: Set<string> = new Set(),
): Promise<GP200Preset> {
  const label = SysExCodec.slotToLabel(slot);
  const check = (written: GP200Preset): KnobDifference[] => {
    const { identity } = describeWriteFidelity(written, sent);
    const differences = knobDifferenceList(written, sent);
    if (identity.length > 0) {
      const wrong = [...identity, ...differences.map((difference) => difference.line)];
      throw new Error(problem(`${wrong.slice(0, 3).join('; ')}${wrong.length > 3 ? '; …' : ''}`));
    }
    return differences;
  };

  let written = await device.writePresetToSlot(sent, slot);
  let differences = check(written);
  if (differences.length === 0) return written;

  // Anything not already known to be the pedal's own choice gets one more
  // chance, because a single message to a block can simply be swallowed.
  if (differences.some((difference) => !stubborn.has(difference.key))) {
    const lines = differences.map((difference) => difference.line);
    console.warn(`[GP-200] ${label} missed ${lines.length} value(s), sending those again:`, lines);
    written = device.retouchParams
      ? await device.retouchParams(slot, sent.patchName, differences)
      // No targeted path (an older device object): write the patch again.
      : await device.writePresetToSlot(sent, slot);
    differences = check(written);
    if (differences.length === 0) return written;
  }

  // Still wrong after being sent on its own: the pedal keeps its own value.
  const lines = differences.map((difference) => difference.line);
  console.warn(`[GP-200] ${label} kept ${lines.length} value(s) its own way:`, lines);
  missed.push(...lines.map((line) => `${label} ${line}`));
  rememberStubbornValues(differences.map((difference) => difference.key));
  for (const difference of differences) stubborn.add(difference.key);
  return written;
}

/** What writeChecked needs of the pedal: the full write, and ideally the
 *  targeted re-send that makes its second attempt cheap. */
export interface CheckedWriteDevice {
  writePresetToSlot(preset: GP200Preset, slot: number): Promise<GP200Preset>;
  retouchParams?(
    slot: number,
    presetName: string,
    controls: readonly KnobDifference[],
  ): Promise<GP200Preset>;
}

/**
 * Does the slot already hold this patch, allowing for controls the pedal is
 * known to keep its own way? A wrong name, effect or on/off state never
 * counts as close enough.
 */
export function closeEnough(current: GP200Preset, wanted: GP200Preset, stubborn: Set<string>): boolean {
  const { identity } = describeWriteFidelity(current, wanted);
  if (identity.length > 0) return false;
  return knobDifferenceList(current, wanted).every((difference) => stubborn.has(difference.key));
}

/** The pedal operations PROTECT 64 needs (useMidiDevice provides them). */
export interface ProtectDevice {
  pullPreset(slot: number): Promise<GP200Preset>;
  /** Write a patch from app data into a slot; resolves with the read-back. */
  writePresetToSlot(preset: GP200Preset, slot: number): Promise<GP200Preset>;
  /** Re-send just these controls and save again (see CheckedWriteDevice). */
  retouchParams?(
    slot: number,
    presetName: string,
    controls: readonly KnobDifference[],
  ): Promise<GP200Preset>;
  copySlotOnDevice(fromSlot: number, toSlot: number, copied: GP200Preset, saveAs?: string): Promise<GP200Preset>;
}

const label = (slot: number) => SysExCodec.slotToLabel(slot);

/**
 * Fill 64A–64D from the patch shipped with the app, so nothing on the pedal
 * is needed first: one write from app data into 64C as its fixed name (checked
 * against what was sent), then verified on-pedal copies of 64C into the other
 * three under their protected names. Resolves with what 64C holds: the new
 * default. Differences the live write can't avoid (EXP targets, a
 * footswitch's saved position) don't fail it; see writeFidelity.
 */
export async function protectBank64(
  device: ProtectDevice,
  shipped: GP200Preset,
  onProgress?: (done: number, total: number) => void,
  /** Filled with any values the pedal kept its own way (see writeChecked). */
  missed: string[] = [],
): Promise<GP200Preset> {
  const total = PROTECTED_LAYOUT.length;
  const sent = { ...structuredClone(shipped), patchName: DEFAULT_SLOT_NAME };
  const stubborn = loadStubbornValues();
  let written: GP200Preset;
  // Already the shipped patch? Then skip the write: it costs 10-20 s, and a
  // second PROTECT 64 (after a failure, or on another browser) usually finds
  // 64C exactly as it left it.
  try {
    const current = await device.pullPreset(PROTECTED_DEFAULT_SLOT);
    if (closeEnough(current, sent, stubborn)) {
      onProgress?.(1, total);
      return await copyAcrossBank(device, current, missed, onProgress, total);
    }
  } catch {
    // Unreadable just now: write it, as before.
  }
  try {
    written = await writeChecked(device, sent, PROTECTED_DEFAULT_SLOT, (differences) =>
      `${label(PROTECTED_DEFAULT_SLOT)} didn’t take the shipped patch (${differences}); `
      + 'bank 64 is not protected, run PROTECT 64 again', missed, stubborn);
  } catch (err) {
    if (err instanceof Error && err.message.includes('didn’t take the shipped patch')) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${detail}. Stopped at ${label(PROTECTED_DEFAULT_SLOT)}; bank 64 is not protected, run PROTECT 64 again`, { cause: err });
  }
  onProgress?.(1, total);
  return copyAcrossBank(device, written, missed, onProgress, total);
}

/**
 * Fill the bank's other three slots from 64C, each under its fixed name, as
 * verified on-pedal copies (a couple of seconds each). A slot that already
 * holds it is left alone.
 */
async function copyAcrossBank(
  device: ProtectDevice,
  written: GP200Preset,
  _missed: string[],
  onProgress: ((done: number, total: number) => void) | undefined,
  total: number,
): Promise<GP200Preset> {
  let done = 1;
  for (const { slot, name } of PROTECTED_LAYOUT) {
    if (slot === PROTECTED_DEFAULT_SLOT) continue;
    let current: GP200Preset | null = null;
    try {
      current = await device.pullPreset(slot);
    } catch {
      current = null;
    }
    if (!current || !closeEnough(current, { ...written, patchName: name }, new Set())) {
      try {
        await device.copySlotOnDevice(PROTECTED_DEFAULT_SLOT, slot, written, name);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`${detail}. Stopped at ${label(slot)}; bank 64 is not protected, run PROTECT 64 again`, { cause: err });
      }
    }
    done += 1;
    onProgress?.(done, total);
  }
  return written;
}
