import { describe, expect, it } from 'vitest';
import { createDefaultPreset } from '@/core/defaultPreset';
import {
  applyHistory,
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  recordAction,
  type HistoryEntry,
  type UndoDevice,
} from '@/core/undoHistory';
import type { GP200Preset } from '@/core/types';

const patch = (name: string, knob = 50): GP200Preset => {
  const preset = { ...createDefaultPreset(), patchName: name };
  preset.effects[2].params[0] = knob;
  return preset;
};

function fakePedal(initial: Record<number, GP200Preset>) {
  const slots = new Map<number, GP200Preset>(Object.entries(initial).map(([k, v]) => [Number(k), structuredClone(v)]));
  const log: string[] = [];
  const device: UndoDevice = {
    async pullPreset(slot) { return structuredClone(slots.get(slot)!); },
    async writePresetToSlot(preset, slot) { log.push(`write ${slot} ${preset.patchName}`); slots.set(slot, structuredClone(preset)); return structuredClone(preset); },
    async renameSlot(slot, name) { log.push(`rename ${slot} ${name}`); slots.set(slot, { ...slots.get(slot)!, patchName: name }); },
    async swap(first, second) {
      log.push(`swap ${first} ${second}`);
      const a = slots.get(first)!;
      slots.set(first, slots.get(second)!);
      slots.set(second, a);
    },
  };
  return { device, log, nameAt: (slot: number) => slots.get(slot)?.patchName, slots };
}

describe('recordAction', () => {
  it('keeps the last 20 actions and clears redo', () => {
    let history = { ...EMPTY_HISTORY, redo: [{ kind: 'rename', label: 'x', slot: 0, from: 'a', to: 'b' } as HistoryEntry] };
    for (let i = 0; i < 25; i++) history = recordAction(history, { kind: 'rename', label: `r${i}`, slot: 0, from: 'a', to: 'b' });
    expect(history.undo).toHaveLength(HISTORY_LIMIT);
    expect(history.undo[0].label).toBe('r5');
    expect(history.redo).toEqual([]);
  });
});

describe('applyHistory: overwrite', () => {
  const entry: HistoryEntry = {
    kind: 'overwrite',
    label: 'Paste into 2A–2B',
    slots: [
      { slot: 4, before: patch('Old A'), after: patch('New A') },
      { slot: 5, before: patch('Old B'), after: patch('New B') },
    ],
  };

  it('undo writes the old patches back (in reverse), redo writes the new ones', async () => {
    const pedal = fakePedal({ 4: patch('New A'), 5: patch('New B') });
    const undone = await applyHistory(pedal.device, entry, 'undo');
    expect(pedal.log).toEqual(['write 5 Old B', 'write 4 Old A']);
    expect([pedal.nameAt(4), pedal.nameAt(5)]).toEqual(['Old A', 'Old B']);
    await applyHistory(pedal.device, undone, 'redo');
    expect([pedal.nameAt(4), pedal.nameAt(5)]).toEqual(['New A', 'New B']);
  });

  it('refuses, before writing anything, if a slot changed since', async () => {
    const pedal = fakePedal({ 4: patch('New A'), 5: patch('Edited on the pedal') });
    await expect(applyHistory(pedal.device, entry, 'undo')).rejects.toThrow('2B changed since, so it wasn’t undone');
    expect(pedal.log).toEqual([]);
  });

  it('a knob changed since also counts as a change', async () => {
    const pedal = fakePedal({ 4: patch('New A', 77), 5: patch('New B') });
    await expect(applyHistory(pedal.device, entry, 'undo')).rejects.toThrow('2A changed since');
  });
});

describe('applyHistory: swap and rename', () => {
  it('undo and redo a swap by swapping again, checking each time', async () => {
    const entry: HistoryEntry = { kind: 'swap', label: 'Swap', first: 0, second: 1, firstAfter: patch('B'), secondAfter: patch('A') };
    const pedal = fakePedal({ 0: patch('B'), 1: patch('A') });
    await applyHistory(pedal.device, entry, 'undo');
    expect([pedal.nameAt(0), pedal.nameAt(1)]).toEqual(['A', 'B']);
    await applyHistory(pedal.device, entry, 'redo');
    expect([pedal.nameAt(0), pedal.nameAt(1)]).toEqual(['B', 'A']);
    expect(pedal.log).toEqual(['swap 0 1', 'swap 0 1']);
  });

  it('undo and redo a rename', async () => {
    const entry: HistoryEntry = { kind: 'rename', label: 'Rename', slot: 3, from: 'Old', to: 'New' };
    const pedal = fakePedal({ 3: patch('New') });
    await applyHistory(pedal.device, entry, 'undo');
    expect(pedal.nameAt(3)).toBe('Old');
    await applyHistory(pedal.device, entry, 'redo');
    expect(pedal.nameAt(3)).toBe('New');
    const moved = fakePedal({ 3: patch('Someone else') });
    await expect(applyHistory(moved.device, entry, 'undo')).rejects.toThrow('1D changed since');
  });
});
