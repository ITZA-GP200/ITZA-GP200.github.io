import { SysExCodec } from './SysExCodec';
import { describeWriteFidelity } from './writeFidelity';
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
 * sent. A wrong name or effect type fails at once; if only knob values are
 * off, the slot is written once more first: on hardware a long restore once
 * left a single knob at its default (PRE Clipping 10 instead of 0) while the
 * same backup had restored cleanly minutes before. Returns the read-back.
 * `problem` builds the error message from the differences.
 */
export async function writeChecked(
  device: Pick<ProtectDevice, 'writePresetToSlot'>,
  sent: GP200Preset,
  slot: number,
  problem: (differences: string) => string,
): Promise<GP200Preset> {
  for (let attempt = 1; ; attempt++) {
    const written = await device.writePresetToSlot(sent, slot);
    const { identity, values } = describeWriteFidelity(written, sent);
    if (identity.length === 0 && values.length === 0) return written;
    const wrong = [...identity, ...values];
    const summary = `${wrong.slice(0, 3).join('; ')}${wrong.length > 3 ? '; …' : ''}`;
    if (identity.length > 0 || attempt >= 2) throw new Error(problem(summary));
    console.warn(`[GP-200] ${SysExCodec.slotToLabel(slot)} write missed ${wrong.length} value(s), writing again:`, wrong);
  }
}

/** The pedal operations PROTECT 64 needs (useMidiDevice provides them). */
export interface ProtectDevice {
  /** Write a patch from app data into a slot; resolves with the read-back. */
  writePresetToSlot(preset: GP200Preset, slot: number): Promise<GP200Preset>;
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
): Promise<GP200Preset> {
  const total = PROTECTED_LAYOUT.length;
  const sent = { ...structuredClone(shipped), patchName: DEFAULT_SLOT_NAME };
  let written: GP200Preset;
  try {
    written = await writeChecked(device, sent, PROTECTED_DEFAULT_SLOT, (differences) =>
      `${label(PROTECTED_DEFAULT_SLOT)} didn’t take the shipped patch (${differences}); `
      + 'bank 64 is not protected, run PROTECT 64 again');
  } catch (err) {
    if (err instanceof Error && err.message.includes('didn’t take the shipped patch')) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${detail}. Stopped at ${label(PROTECTED_DEFAULT_SLOT)}; bank 64 is not protected, run PROTECT 64 again`, { cause: err });
  }
  onProgress?.(1, total);

  let done = 1;
  for (const { slot, name } of PROTECTED_LAYOUT) {
    if (slot === PROTECTED_DEFAULT_SLOT) continue;
    try {
      await device.copySlotOnDevice(PROTECTED_DEFAULT_SLOT, slot, written, name);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`${detail}. Stopped at ${label(slot)}; bank 64 is not protected, run PROTECT 64 again`, { cause: err });
    }
    done += 1;
    onProgress?.(done, total);
  }
  return written;
}
