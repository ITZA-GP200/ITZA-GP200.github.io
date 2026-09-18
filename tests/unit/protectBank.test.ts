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

function fakePedal(initial: Record<number, string>, options: { failCopyTo?: number; dropKnob?: boolean } = {}) {
  const slots = new Map<number, GP200Preset>();
  for (const [slot, name] of Object.entries(initial)) slots.set(Number(slot), patch(name));
  const log: string[] = [];
  const device: ProtectDevice = {
    async writePresetToSlot(preset, slot) {
      log.push(`write ${slot} as ${preset.patchName}`);
      const stored = structuredClone(preset);
      if (options.dropKnob) stored.effects[0].params[0] = 99;
      slots.set(slot, stored);
      return structuredClone(stored);
    },
    async copySlotOnDevice(from, to, copied, saveAs) {
      // Like the real copy: refuse if the source no longer matches.
      if (slots.get(from)!.patchName !== copied.patchName) throw new Error(`${from} changed`);
      log.push(`${from}->${to} as ${saveAs}`);
      if (to === options.failCopyTo) throw new Error('The pedal didn’t take the copy');
      slots.set(to, { ...structuredClone(slots.get(from)!), patchName: saveAs ?? copied.patchName });
      return structuredClone(slots.get(to)!);
    },
  };
  return { device, log, nameAt: (slot: number) => slots.get(slot)?.patchName };
}

describe('protectBank64', () => {
  it('writes the shipped patch into 64C as DEFAULT, then copies it on the pedal', async () => {
    const pedal = fakePedal({ 252: 'Mr. Brown', 253: 'Mr. Brown', 254: 'Mr. Brown', 255: 'Mr. Brown' });
    const result = await protectBank64(pedal.device, patch("It's GP-200"));
    expect(pedal.log).toEqual([
      'write 254 as DEFAULT',
      '254->252 as Itza GP-200',
      '254->253 as Itza GP-200',
      '254->255 as SWAP SLOT',
    ]);
    expect([252, 253, 254, 255].map(pedal.nameAt)).toEqual(['Itza GP-200', 'Itza GP-200', 'DEFAULT', 'SWAP SLOT']);
    expect(result.patchName).toBe('DEFAULT');
  });

  it('needs nothing on the pedal first and leaves the shipped patch untouched', async () => {
    const pedal = fakePedal({});
    const shipped = patch("It's GP-200");
    await protectBank64(pedal.device, shipped);
    expect(shipped.patchName).toBe("It's GP-200");
  });

  it('refuses to copy a write the pedal didn’t take faithfully', async () => {
    const pedal = fakePedal({}, { dropKnob: true });
    await expect(protectBank64(pedal.device, patch("It's GP-200")))
      .rejects.toThrow('64C didn’t take the shipped patch');
    expect(pedal.log).toEqual(['write 254 as DEFAULT']);
  });

  it('says where it stopped and that bank 64 is not protected', async () => {
    const pedal = fakePedal({}, { failCopyTo: 253 });
    await expect(protectBank64(pedal.device, patch("It's GP-200")))
      .rejects.toThrow('Stopped at 64B; bank 64 is not protected, run PROTECT 64 again');
  });

  it('reports progress per slot', async () => {
    const pedal = fakePedal({});
    const seen: string[] = [];
    await protectBank64(pedal.device, patch('X'), (d, t) => seen.push(`${d}/${t}`));
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
