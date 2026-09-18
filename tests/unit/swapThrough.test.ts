import { describe, expect, it } from 'vitest';
import { createDefaultPreset } from '@/core/defaultPreset';
import { isSamePatch, SourceChangedError } from '@/core/samePatch';
import { swapThroughScratch, type SwapDevice } from '@/core/swapThrough';
import type { GP200Preset } from '@/core/types';

const patch = (name: string): GP200Preset => ({ ...createDefaultPreset(), patchName: name });

/** An in-memory pedal: slots hold patches, copies behave like the real one. */
function fakePedal(initial: Record<number, string>, failCopy?: { from: number; to: number }) {
  const slots = new Map<number, GP200Preset>();
  for (const [slot, name] of Object.entries(initial)) slots.set(Number(slot), patch(name));
  const log: string[] = [];
  const nameAt = (slot: number) => slots.get(slot)?.patchName;
  const device: SwapDevice = {
    async pullPreset(slot) {
      log.push(`read ${slot}`);
      return structuredClone(slots.get(slot)!);
    },
    async copySlotOnDevice(from, to, copied) {
      log.push(`copy ${from}->${to}`);
      const source = slots.get(from)!;
      if (!isSamePatch(source, copied)) throw new SourceChangedError(from, 'name differs');
      if (failCopy && failCopy.from === from && failCopy.to === to) throw new Error('The pedal didn’t take the copy');
      slots.set(to, structuredClone(source));
      return structuredClone(source);
    },
  };
  return { device, log, nameAt };
}

describe('swapThroughScratch', () => {
  it('exchanges two slots through the scratch slot', async () => {
    const pedal = fakePedal({ 1: 'Angel', 2: 'Durango', 9: 'scratch junk' });
    const result = await swapThroughScratch(pedal.device, { first: 1, second: 2, scratch: 9 });
    expect(pedal.nameAt(1)).toBe('Durango');
    expect(pedal.nameAt(2)).toBe('Angel');
    expect(pedal.nameAt(9)).toBe('Durango'); // the scratch slot's old contents are gone
    expect(result.patchName).toBe('Durango');
  });

  it('reads both patches before writing anything, then copies in the safe order', async () => {
    const pedal = fakePedal({ 1: 'Angel', 2: 'Durango', 9: 'x' });
    await swapThroughScratch(pedal.device, { first: 1, second: 2, scratch: 9 });
    expect(pedal.log).toEqual(['read 1', 'read 2', 'copy 2->9', 'copy 1->2', 'copy 9->1']);
  });

  it('refuses before touching the pedal when no scratch slot is set', async () => {
    const pedal = fakePedal({ 1: 'Angel', 2: 'Durango' });
    await expect(swapThroughScratch(pedal.device, { first: 1, second: 2, scratch: null }))
      .rejects.toThrow('SET AS SWAP SLOT');
    expect(pedal.log).toEqual([]);
  });

  it('refuses when the scratch slot is one of the pair, or both are the same slot', async () => {
    const pedal = fakePedal({ 1: 'Angel', 2: 'Durango' });
    await expect(swapThroughScratch(pedal.device, { first: 1, second: 2, scratch: 2 }))
      .rejects.toThrow('can’t take part in a swap');
    await expect(swapThroughScratch(pedal.device, { first: 1, second: 1, scratch: 9 }))
      .rejects.toThrow('two different slots');
    expect(pedal.log).toEqual([]);
  });

  it('refuses a stale clipboard without touching the target', async () => {
    const pedal = fakePedal({ 1: 'Angel (edited)', 2: 'Durango', 9: 'x' });
    await expect(
      swapThroughScratch(pedal.device, { first: 1, second: 2, scratch: 9, expectedFirst: patch('Angel') }),
    ).rejects.toBeInstanceOf(SourceChangedError);
    expect(pedal.nameAt(1)).toBe('Angel (edited)');
    expect(pedal.nameAt(2)).toBe('Durango');
  });

  it('says the second patch is safe in the scratch slot when the middle copy fails', async () => {
    const pedal = fakePedal({ 1: 'Angel', 2: 'Durango', 9: 'x' }, { from: 1, to: 2 });
    await expect(swapThroughScratch(pedal.device, { first: 1, second: 2, scratch: 9 }))
      .rejects.toThrow('1C’s patch is safe in the swap slot 3B');
    expect(pedal.nameAt(9)).toBe('Durango');
  });

  it('says where both patches are when the last copy fails', async () => {
    const pedal = fakePedal({ 1: 'Angel', 2: 'Durango', 9: 'x' }, { from: 9, to: 1 });
    await expect(swapThroughScratch(pedal.device, { first: 1, second: 2, scratch: 9 }))
      .rejects.toThrow('1B’s patch is now in 1C, and 1C’s is in the swap slot 3B');
  });
});
