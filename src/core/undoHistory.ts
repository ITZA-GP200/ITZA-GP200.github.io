import { writeChecked } from './protectBank';
import { SysExCodec } from './SysExCodec';
import type { GP200Preset } from './types';
import { describeWriteFidelity } from './writeFidelity';

/**
 * UNDO / REDO for the Patch Manager's slot actions.
 *
 * The pedal can't return to an earlier state, so undo performs the reverse
 * action: a swap is swapped back (exact, fast), a rename is renamed back, and
 * anything that overwrote patches writes the old ones back from the copies
 * kept here (a write from app data: ~10-20 s per slot, and expression-pedal
 * targets / footswitch positions can't be written live). One entry per user
 * action (a 4-patch paste is one), the last HISTORY_LIMIT kept, for this
 * session only (cleared on reload or disconnect). Before touching the pedal,
 * every slot is checked to still hold what the action left there, so an
 * undo never wipes a change made on the pedal since.
 */

export const HISTORY_LIMIT = 20;

export type HistoryEntry =
  | {
    kind: 'overwrite';
    /** "Paste into 61A–61D" */
    label: string;
    slots: { slot: number; before: GP200Preset; after: GP200Preset }[];
  }
  | {
    kind: 'swap';
    label: string;
    first: number;
    second: number;
    /** What each slot held after the swap. */
    firstAfter: GP200Preset;
    secondAfter: GP200Preset;
  }
  | { kind: 'rename'; label: string; slot: number; from: string; to: string };

export interface History {
  undo: HistoryEntry[];
  redo: HistoryEntry[];
}

export const EMPTY_HISTORY: History = { undo: [], redo: [] };

/** Record a new action: it goes on the undo list (last 20 kept), and the redo
 *  list is cleared, as in any editor. */
export function recordAction(history: History, entry: HistoryEntry): History {
  return { undo: [...history.undo, entry].slice(-HISTORY_LIMIT), redo: [] };
}

/** The pedal operations UNDO / REDO need (useMidiDevice + App provide them). */
export interface UndoDevice {
  pullPreset(slot: number): Promise<GP200Preset>;
  writePresetToSlot(preset: GP200Preset, slot: number): Promise<GP200Preset>;
  renameSlot(slot: number, name: string): Promise<void>;
  /** Exchange two slots (the app's swap through the swap slot). */
  swap(first: number, second: number): Promise<void>;
}

const label = (slot: number) => SysExCodec.slotToLabel(slot);

/** Same patch, as far as the pedal is concerned: name, effects, on/off and
 *  the knobs each effect really has. */
export function samePatchOnPedal(actual: GP200Preset, expected: GP200Preset): boolean {
  const { identity, values } = describeWriteFidelity(actual, expected);
  return identity.length === 0 && values.length === 0;
}

async function checkSlots(device: UndoDevice, expected: { slot: number; patch: GP200Preset }[], verb: string) {
  const changed: string[] = [];
  for (const { slot, patch } of expected) {
    // Name the difference, not just the slot: "what changed?" is the first
    // thing anyone asks, and a refusal nobody can explain looks like a bug.
    const { identity, values } = describeWriteFidelity(await device.pullPreset(slot), patch);
    const differences = [...identity, ...values];
    if (differences.length > 0) {
      console.warn(`[GP-200] ${label(slot)} changed since the action:`, differences);
      changed.push(`${label(slot)} (${differences.slice(0, 2).join('; ')}${differences.length > 2 ? '; …' : ''})`);
    }
  }
  if (changed.length > 0) {
    throw new Error(`${changed.join(', ')} changed since, so it wasn’t ${verb} (that would wipe the change)`);
  }
}

/**
 * Undo (direction 'undo') or redo one entry on the pedal. Returns the entry as
 * it now stands: for overwrites the written slots' read-backs replace the
 * stored patches, so the opposite direction's check matches what's really
 * there. Values the pedal wouldn't take are added to `missed`.
 */
export async function applyHistory(
  device: UndoDevice,
  entry: HistoryEntry,
  direction: 'undo' | 'redo',
  missed: string[] = [],
): Promise<HistoryEntry> {
  const verb = direction === 'undo' ? 'undone' : 'redone';
  if (entry.kind === 'rename') {
    const [expected, target] = direction === 'undo' ? [entry.to, entry.from] : [entry.from, entry.to];
    const now = (await device.pullPreset(entry.slot)).patchName.trim();
    if (now !== expected.trim()) {
      throw new Error(`${label(entry.slot)} changed since, so it wasn’t ${verb} (that would wipe the change)`);
    }
    await device.renameSlot(entry.slot, target);
    return entry;
  }
  if (entry.kind === 'swap') {
    // Undo: each slot still holds what the swap left. Redo: each holds the
    // other's (the undo swapped them back).
    const [firstNow, secondNow] = direction === 'undo'
      ? [entry.firstAfter, entry.secondAfter]
      : [entry.secondAfter, entry.firstAfter];
    await checkSlots(device, [{ slot: entry.first, patch: firstNow }, { slot: entry.second, patch: secondNow }], verb);
    await device.swap(entry.first, entry.second);
    return entry;
  }
  const from = direction === 'undo' ? 'after' : 'before';
  const to = direction === 'undo' ? 'before' : 'after';
  await checkSlots(device, entry.slots.map((item) => ({ slot: item.slot, patch: item[from] })), verb);
  const slots = [...entry.slots];
  // Undo in reverse order, redo in the original order.
  const order = direction === 'undo' ? [...slots.keys()].reverse() : [...slots.keys()];
  for (const i of order) {
    const item = slots[i];
    const written = await writeChecked(device, item[to], item.slot,
      (differences) => `${label(item.slot)} didn’t take the old patch back (${differences})`, missed);
    slots[i] = { ...item, [to]: written };
  }
  return { ...entry, slots };
}
