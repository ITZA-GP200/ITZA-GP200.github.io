import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultPreset } from '@/core/defaultPreset';
import {
  isProtectedSlot,
  loadBankProtected,
  protectBank64,
  saveBankProtected,
  type ProtectDevice,
} from '@/core/protectBank';
import { pasteProblem } from '@/core/multiPaste';
import type { GP200Preset } from '@/core/types';

const patch = (name: string): GP200Preset => ({ ...createDefaultPreset(), patchName: name });

function fakePedal(initial: Record<number, string>, failAt?: number) {
  const slots = new Map<number, GP200Preset>();
  for (const [slot, name] of Object.entries(initial)) slots.set(Number(slot), patch(name));
  const log: string[] = [];
  const device: ProtectDevice = {
    async copySlotOnDevice(from, to, copied, saveAs) {
      // Like the real copy: refuse if the source no longer matches.
      if (slots.get(from)!.patchName !== copied.patchName) throw new Error(`${from} changed`);
      log.push(`${from}->${to} as ${saveAs}`);
      if (to === failAt) throw new Error('The pedal didn’t take the copy');
      slots.set(to, { ...structuredClone(slots.get(from)!), patchName: saveAs ?? copied.patchName });
      return structuredClone(slots.get(to)!);
    },
  };
  return { device, log, nameAt: (slot: number) => slots.get(slot)?.patchName };
}

describe('protectBank64', () => {
  it('fills 64A–64D from the default under the protected names and returns the new default', async () => {
    const pedal = fakePedal({ 10: 'Itza GP-200' });
    const result = await protectBank64(pedal.device, { slot: 10, preset: patch('Itza GP-200') });
    expect([252, 253, 254, 255].map(pedal.nameAt)).toEqual(['Itza GP-200', 'Itza GP-200', 'DEFAULT', 'SWAP SLOT']);
    expect(result.patchName).toBe('DEFAULT');
  });

  it('writes the default’s own slot last when it already lives in bank 64', async () => {
    const pedal = fakePedal({ 252: 'Itza GP-200' });
    await protectBank64(pedal.device, { slot: 252, preset: patch('Itza GP-200') });
    expect(pedal.log).toEqual([
      '252->253 as Itza GP-200',
      '252->254 as DEFAULT',
      '252->255 as SWAP SLOT',
      '252->252 as Itza GP-200',
    ]);
  });

  it('works from a default in 64C, renaming it DEFAULT last', async () => {
    const pedal = fakePedal({ 254: 'My Default' });
    const result = await protectBank64(pedal.device, { slot: 254, preset: patch('My Default') });
    expect(pedal.log.at(-1)).toBe('254->254 as DEFAULT');
    expect([252, 253, 254, 255].map(pedal.nameAt)).toEqual(['Itza GP-200', 'Itza GP-200', 'DEFAULT', 'SWAP SLOT']);
    expect(result.patchName).toBe('DEFAULT');
  });

  it('says where it stopped and that bank 64 is not protected', async () => {
    const pedal = fakePedal({ 10: 'X' }, 253);
    await expect(protectBank64(pedal.device, { slot: 10, preset: patch('X') }))
      .rejects.toThrow('Stopped at 64B; bank 64 is not protected, run PROTECT 64 again');
  });

  it('reports progress per slot', async () => {
    const pedal = fakePedal({ 10: 'X' });
    const seen: string[] = [];
    await protectBank64(pedal.device, { slot: 10, preset: patch('X') }, (d, t) => seen.push(`${d}/${t}`));
    expect(seen).toEqual(['1/4', '2/4', '3/4', '4/4']);
  });
});

describe('bank 64 protection flag', () => {
  beforeEach(() => localStorage.clear());

  it('persists on and off', () => {
    expect(loadBankProtected()).toBe(false);
    saveBankProtected(true);
    expect(loadBankProtected()).toBe(true);
    saveBankProtected(false);
    expect(loadBankProtected()).toBe(false);
  });

  it('covers exactly 64A–64D', () => {
    expect(isProtectedSlot(251)).toBe(false);
    expect(isProtectedSlot(252)).toBe(true);
  });
});

describe('pasteProblem with bank 64 protected', () => {
  it('keeps a paste that starts below bank 64 out of it', () => {
    expect(pasteProblem([0, 1], 251, true)).toBe('Not enough room: 2 patches from 63D would run into protected bank 64');
    expect(pasteProblem([0, 1], 250, true)).toBeNull();
    expect(pasteProblem([0, 1], 251, false)).toBeNull();
  });

  it('allows a paste that starts in bank 64 (a direct action there)', () => {
    expect(pasteProblem([0, 1], 252, true)).toBeNull();
    expect(pasteProblem([0], 255, true)).toBeNull();
  });
});
