import { PRSTDecoder } from './PRSTDecoder';
import { PRSTEncoder } from './PRSTEncoder';
import {
  PROTECTED_DEFAULT_SLOT,
  PROTECTED_LAYOUT,
  PROTECTED_SWAP_SLOT,
  protectedNameFor,
  SWAP_SLOT_NAME,
  closeEnough,
  writeChecked,
} from './protectBank';
import { SysExCodec } from './SysExCodec';
import { sameSettings } from './writeFidelity';
import { loadStubbornValues } from './stubbornValues';
import type { GP200Preset } from './types';

/**
 * SAVE / RESTORE 64: a backup of the protected bank's settings.
 *
 * 64A, 64B and 64C are saved as standard .prst patches (base64) inside one
 * JSON file; 64D is always a copy of 64C named SWAP SLOT, so RESTORE rebuilds
 * it. The same backup is kept in this browser's localStorage for one-click
 * restore, and downloaded as a file that survives clearing browser data.
 */

export const BACKUP_SLOTS = [252, 253, PROTECTED_DEFAULT_SLOT] as const;
const FORMAT = 'gp200-bank64';
const STORAGE_KEY = 'gp200:bank64Backup';

export interface Bank64Backup {
  format: typeof FORMAT;
  version: 1;
  /** ISO time of the SAVE. */
  savedAt: string;
  slots: { slot: number; name: string; prst: string }[];
}

const label = (slot: number) => SysExCodec.slotToLabel(slot);

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

/** Build a backup from what 64A, 64B and 64C hold (in BACKUP_SLOTS order). */
export function makeBank64Backup(patches: GP200Preset[], now = new Date()): Bank64Backup {
  return {
    format: FORMAT,
    version: 1,
    savedAt: now.toISOString(),
    slots: BACKUP_SLOTS.map((slot, i) => ({
      slot,
      name: patches[i].patchName,
      prst: toBase64(new Uint8Array(new PRSTEncoder().encode({ ...patches[i], slotIndex: slot }))),
    })),
  };
}

/** Parse and check a backup (from the browser or a file); throws a plain
 *  message when it isn't one. Returns the patches in BACKUP_SLOTS order. */
export function readBank64Backup(text: string): { savedAt: string; patches: GP200Preset[] } {
  let parsed: Partial<Bank64Backup>;
  try {
    parsed = JSON.parse(text) as Partial<Bank64Backup>;
  } catch {
    throw new Error('That file isn’t a bank 64 backup (it isn’t JSON)');
  }
  if (parsed.format !== FORMAT || parsed.version !== 1 || !Array.isArray(parsed.slots)) {
    throw new Error('That file isn’t a bank 64 backup from this app');
  }
  const patches = BACKUP_SLOTS.map((slot) => {
    const entry = parsed.slots!.find((candidate) => candidate.slot === slot);
    if (!entry || typeof entry.prst !== 'string') throw new Error(`The backup has no ${label(slot)} patch`);
    try {
      return new PRSTDecoder(fromBase64(entry.prst)).decode();
    } catch {
      throw new Error(`The backup’s ${label(slot)} patch is damaged`);
    }
  });
  return { savedAt: String(parsed.savedAt ?? ''), patches };
}

export function saveBrowserBackup(backup: Bank64Backup): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
  } catch {
    // Storage unavailable: the downloaded file is still the backup.
  }
}

/** The raw JSON of the last SAVE in this browser, or null. */
export function loadBrowserBackupText(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** "GP200 bank 64 backup 2026-09-18.json" */
export function backupFilename(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `GP200 bank 64 backup ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * Protected slots whose name on the pedal isn't its fixed name, as
 * "64C is now “Mr. Brown”" lines. Empty when all match, or while any of them
 * hasn't been read yet (null).
 */
export function bank64NameChanges(presetNames: (string | null)[]): string[] {
  const names = PROTECTED_LAYOUT.map(({ slot }) => presetNames[slot]);
  if (names.some((name) => name === null || name === undefined)) return [];
  return PROTECTED_LAYOUT
    .filter(({ slot, name }) => (presetNames[slot] ?? '').trim() !== name)
    .map(({ slot }) => `${label(slot)} is now “${(presetNames[slot] ?? '').trim()}”`);
}

/** The pedal operations RESTORE 64 needs (useMidiDevice provides them). */
export interface RestoreDevice {
  pullPreset(slot: number): Promise<GP200Preset>;
  writePresetToSlot(preset: GP200Preset, slot: number): Promise<GP200Preset>;
  copySlotOnDevice(fromSlot: number, toSlot: number, copied: GP200Preset, saveAs?: string): Promise<GP200Preset>;
}

/**
 * Write a backup back into bank 64: 64C first (the default), then 64A and
 * 64B, each from app data under its fixed name and checked against what was
 * sent; then 64D as an on-pedal copy of 64C named SWAP SLOT. Resolves with
 * what 64C holds: the default. EXP targets and a footswitch's saved position
 * can't be written live (see writeFidelity), so they don't fail it.
 */
export async function restoreBank64(
  device: RestoreDevice,
  patches: GP200Preset[],
  onProgress?: (done: number, total: number) => void,
  /** Filled with any values the pedal kept its own way (see writeChecked). */
  missed: string[] = [],
): Promise<GP200Preset> {
  const total = BACKUP_SLOTS.length + 1;
  const order = [PROTECTED_DEFAULT_SLOT, 252, 253];
  let done = 0;
  let restoredDefault: GP200Preset | null = null;
  // Slots already dealt with, usable as copy sources: `wanted` is what the
  // backup asked for, `stored` what the pedal actually kept. A write from app
  // data costs 10-20 s; a copy on the pedal costs about two, and a slot that
  // is already right costs nothing. Bank 64's slots usually hold the same
  // patch, so most of a restore should be skipping and copying.
  const inPlace: { slot: number; wanted: GP200Preset; stored: GP200Preset }[] = [];

  // Controls this pedal refuses, remembered between runs: an old backup can
  // hold one, and without this every slot looks wrong for ever and is
  // rewritten on every restore (49 s on hardware, every time).
  const stubborn = loadStubbornValues();

  for (const slot of order) {
    const index = (BACKUP_SLOTS as readonly number[]).indexOf(slot);
    const sent = { ...structuredClone(patches[index]), patchName: protectedNameFor(slot)! };
    let current: GP200Preset | null = null;
    try {
      current = await device.pullPreset(slot);
    } catch {
      current = null; // unreadable: fall through and write it
    }

    let written: GP200Preset;
    if (current && closeEnough(current, sent, stubborn)) {
      written = current; // already right
    } else {
      // Compare the backup's own patches, not what the pedal made of them:
      // two slots the backup fills alike can be filled by one copy, even if
      // the pedal changed a value while storing the first.
      const source = inPlace.find((candidate) => sameSettings(candidate.wanted, sent));
      try {
        written = source
          ? await device.copySlotOnDevice(source.slot, slot, source.stored, sent.patchName)
          : await writeChecked(device, sent, slot, (differences) =>
            `${label(slot)} didn’t take the backup (${differences}); run RESTORE 64 again`, missed, stubborn);
      } catch (err) {
        if (err instanceof Error && err.message.includes('didn’t take the backup')) throw err;
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`${detail}. Stopped at ${label(slot)}; run RESTORE 64 again`, { cause: err });
      }
    }

    inPlace.push({ slot, wanted: sent, stored: written });
    if (slot === PROTECTED_DEFAULT_SLOT) restoredDefault = written;
    done += 1;
    onProgress?.(done, total);
  }

  // 64D is only ever a copy of the default under its own name.
  const wantedSwap = { ...restoredDefault!, patchName: SWAP_SLOT_NAME };
  let swapNow: GP200Preset | null = null;
  try {
    swapNow = await device.pullPreset(PROTECTED_SWAP_SLOT);
  } catch {
    swapNow = null;
  }
  if (!swapNow || !closeEnough(swapNow, wantedSwap, stubborn)) {
    try {
      await device.copySlotOnDevice(PROTECTED_DEFAULT_SLOT, PROTECTED_SWAP_SLOT, restoredDefault!, SWAP_SLOT_NAME);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`${detail}. Stopped at 64D; run RESTORE 64 again`, { cause: err });
    }
  }
  onProgress?.(total, total);
  return restoredDefault!;
}
