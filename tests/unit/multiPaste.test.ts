import { describe, expect, it } from 'vitest';
import { createDefaultPreset } from '@/core/defaultPreset';
import { describeRange, pasteMany, pasteProblem, type PasteDevice } from '@/core/multiPaste';
import type { GP200Preset } from '@/core/types';

const patch = (name: string): GP200Preset => ({ ...createDefaultPreset(), patchName: name });

function fakePedal(initial: Record<number, string>, failAt?: number) {
  const slots = new Map<number, GP200Preset>();
  for (const [slot, name] of Object.entries(initial)) slots.set(Number(slot), patch(name));
  const log: string[] = [];
  const device: PasteDevice = {
    async copySlotOnDevice(from, to) {
      log.push(`copy ${from}->${to}`);
      if (to === failAt) throw new Error('The pedal didn’t take the copy');
      slots.set(to, structuredClone(slots.get(from)!));
      return structuredClone(slots.get(to)!);
    },
  };
  return { device, log, nameAt: (slot: number) => slots.get(slot)?.patchName };
}

const clip = (entries: [number, string][]) => entries.map(([slot, name]) => ({ slot, preset: patch(name) }));

describe('pasteProblem', () => {
  it('allows a paste that fits outside the copied slots', () => {
    expect(pasteProblem([0, 1, 2, 3], 8)).toBeNull();
    expect(pasteProblem([0], 0)).toBeNull(); // single paste onto itself is harmless
  });

  it('refuses a paste that would run past 64D', () => {
    expect(pasteProblem([0, 1, 2], 254)).toBe('Not enough room: 3 patches from 64C would run past 64D');
    expect(pasteProblem([0, 1, 2], 253)).toBeNull();
  });

  it('refuses a multi-patch paste that overlaps the copied slots', () => {
    expect(pasteProblem([0, 1, 2, 3], 2)).toContain('would overwrite the copied patches');
    expect(pasteProblem([0, 5], 4)).toContain('would overwrite the copied patches'); // 4–5 covers slot 5
  });
});

describe('describeRange', () => {
  it('names one slot or a span', () => {
    expect(describeRange(8, 1)).toBe('3A');
    expect(describeRange(8, 4)).toBe('3A–3D');
  });
});

describe('pasteMany', () => {
  it('copies each patch, in order, into consecutive slots', async () => {
    const pedal = fakePedal({ 0: 'Angel', 5: 'Durango', 9: 'Closer' });
    const seen: string[] = [];
    const result = await pasteMany(pedal.device, clip([[0, 'Angel'], [5, 'Durango'], [9, 'Closer']]), 20, {
      onProgress: (done, total) => seen.push(`${done}/${total}`),
    });
    expect(pedal.log).toEqual(['copy 0->20', 'copy 5->21', 'copy 9->22']);
    expect([20, 21, 22].map(pedal.nameAt)).toEqual(['Angel', 'Durango', 'Closer']);
    expect(seen).toEqual(['1/3', '2/3', '3/3']);
    expect(result).toMatchObject({ done: 3, stopped: false });
    expect(result.last?.patchName).toBe('Closer');
  });

  it('refuses up front without touching the pedal', async () => {
    const pedal = fakePedal({ 0: 'Angel', 1: 'Durango' });
    await expect(pasteMany(pedal.device, clip([[0, 'Angel'], [1, 'Durango']]), 1)).rejects.toThrow('overwrite the copied');
    expect(pedal.log).toEqual([]);
  });

  it('stops at the first failure and says what was pasted and what is untouched', async () => {
    const failing = fakePedal({ 0: 'A', 1: 'B', 2: 'C', 3: 'D' }, 9);
    await expect(pasteMany(failing.device, clip([[0, 'A'], [1, 'B'], [2, 'C'], [3, 'D']]), 8))
      .rejects.toThrow('The pedal didn’t take the copy. Pasted 3A; stopped at 1B → 3B; 3C–3D unchanged');
    expect(failing.log).toEqual(['copy 0->8', 'copy 1->9']);
  });

  it('says nothing was pasted when the first copy fails', async () => {
    const pedal = fakePedal({ 0: 'A' }, 8);
    await expect(pasteMany(pedal.device, clip([[0, 'A']]), 8)).rejects.toThrow('Nothing pasted; stopped at 1A → 3A');
  });

  it('stops cleanly between copies when asked', async () => {
    const pedal = fakePedal({ 0: 'A', 1: 'B', 2: 'C' });
    let calls = 0;
    const result = await pasteMany(pedal.device, clip([[0, 'A'], [1, 'B'], [2, 'C']]), 8, {
      shouldStop: () => calls++ >= 1,
    });
    expect(result).toMatchObject({ done: 1, stopped: true });
    expect(pedal.log).toEqual(['copy 0->8']);
  });
});
