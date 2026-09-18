import { DEFAULT_PATCH_NAME } from './defaultPatch';
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

/** What PROTECT 64 writes, slot by slot. */
export const PROTECTED_LAYOUT: readonly { slot: number; name: string }[] = [
  { slot: 252, name: DEFAULT_PATCH_NAME },
  { slot: 253, name: DEFAULT_PATCH_NAME },
  { slot: PROTECTED_DEFAULT_SLOT, name: 'DEFAULT' },
  { slot: PROTECTED_SWAP_SLOT, name: SWAP_SLOT_NAME },
];

export const isProtectedSlot = (slot: number) => slot > LAST_UNPROTECTED_SLOT;

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

/** The pedal operations PROTECT 64 needs (useMidiDevice provides them). */
export interface ProtectDevice {
  /** Write a patch from app data into a slot; resolves with the read-back. */
  writePresetToSlot(preset: GP200Preset, slot: number): Promise<GP200Preset>;
  copySlotOnDevice(fromSlot: number, toSlot: number, copied: GP200Preset, saveAs?: string): Promise<GP200Preset>;
}

const label = (slot: number) => SysExCodec.slotToLabel(slot);

/**
 * Fill 64A–64D from the patch shipped with the app, so nothing on the pedal
 * is needed first: one write from app data into 64C as "DEFAULT" (checked
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
  const sent = { ...structuredClone(shipped), patchName: 'DEFAULT' };
  let written: GP200Preset;
  try {
    written = await device.writePresetToSlot(sent, PROTECTED_DEFAULT_SLOT);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${detail}. Stopped at ${label(PROTECTED_DEFAULT_SLOT)}; bank 64 is not protected, run PROTECT 64 again`, { cause: err });
  }
  const { identity, values } = describeWriteFidelity(written, sent);
  const wrong = [...identity, ...values];
  if (wrong.length > 0) {
    throw new Error(
      `${label(PROTECTED_DEFAULT_SLOT)} didn’t take the shipped patch (${wrong.slice(0, 3).join('; ')}`
      + `${wrong.length > 3 ? '; …' : ''}); bank 64 is not protected, run PROTECT 64 again`,
    );
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
