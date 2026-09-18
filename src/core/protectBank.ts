import { DEFAULT_PATCH_NAME, type DefaultPatch } from './defaultPatch';
import { SourceChangedError } from './samePatch';
import { SysExCodec } from './SysExCodec';
import type { GP200Preset } from './types';

/**
 * PROTECT 64: bank 64 set aside for the app. Every slot gets a copy of the
 * default patch; 64C becomes the default and 64D the swap slot. While it's
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

/** The pedal operation PROTECT 64 needs (useMidiDevice provides it). */
export interface ProtectDevice {
  copySlotOnDevice(fromSlot: number, toSlot: number, copied: GP200Preset, saveAs?: string): Promise<GP200Preset>;
}

/**
 * Copy the default patch into 64A–64D under the protected names, one
 * verified on-pedal copy each. If the default already lives in bank 64, its
 * own slot is written last, so it's still the patch as read while the others
 * copy from it. Resolves with what 64C holds at the end: the new default.
 */
export async function protectBank64(
  device: ProtectDevice,
  source: DefaultPatch,
  onProgress?: (done: number, total: number) => void,
): Promise<GP200Preset> {
  const order = [
    ...PROTECTED_LAYOUT.filter((entry) => entry.slot !== source.slot),
    ...PROTECTED_LAYOUT.filter((entry) => entry.slot === source.slot),
  ];
  let newDefault: GP200Preset | null = null;
  for (let i = 0; i < order.length; i++) {
    const { slot, name } = order[i];
    let written: GP200Preset;
    try {
      written = await device.copySlotOnDevice(source.slot, slot, source.preset, name);
    } catch (err) {
      // The default slot no longer holds the patch set as default: say so
      // plainly, and what to do, rather than the raw comparison.
      if (err instanceof SourceChangedError) {
        const outcome = i === 0 ? 'Nothing was written' : `Stopped at ${SysExCodec.slotToLabel(slot)}`;
        throw new Error(
          `Your default patch in ${SysExCodec.slotToLabel(source.slot)} has changed on the pedal since it was set. `
          + `${outcome}; bank 64 is not protected. Right-click the patch you want as the default, `
          + 'SET AS DEFAULT PATCH, then PROTECT 64 again',
          { cause: err },
        );
      }
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${detail}. Stopped at ${SysExCodec.slotToLabel(slot)}; bank 64 is not protected, run PROTECT 64 again`,
        { cause: err },
      );
    }
    if (slot === PROTECTED_DEFAULT_SLOT) newDefault = written;
    onProgress?.(i + 1, order.length);
  }
  return newDefault!;
}
