import { beforeEach, describe, expect, it } from 'vitest';
import {
  backupFilename,
  bank64NameChanges,
  loadBrowserBackupText,
  makeBank64Backup,
  readBank64Backup,
  restoreBank64,
  saveBrowserBackup,
  type RestoreDevice,
} from '@/core/bank64Backup';
import { loadShippedPatch } from '@/core/shippedPatch';
import { describeWriteFidelity } from '@/core/writeFidelity';
import type { GP200Preset } from '@/core/types';

const named = (name: string): GP200Preset => ({ ...loadShippedPatch(), patchName: name });

describe('bank 64 backup file', () => {
  it('round-trips 64A–64C through JSON and .prst unchanged', () => {
    const originals = [named('UTILITY-1'), named('UTILITY-2'), named('ITZA GP-200')];
    originals[0].effects[3].params[0] = 77;
    originals[0].effects[3].enabled = true;
    originals[2].patchVolume = 64;
    const text = JSON.stringify(makeBank64Backup(originals, new Date('2026-09-18T12:00:00Z')));
    const { savedAt, patches } = readBank64Backup(text);
    expect(savedAt).toBe('2026-09-18T12:00:00.000Z');
    patches.forEach((patch, i) => {
      const { identity, values } = describeWriteFidelity(patch, originals[i]);
      expect([...identity, ...values]).toEqual([]);
    });
  });

  it('refuses things that aren’t a backup, plainly', () => {
    expect(() => readBank64Backup('not json')).toThrow('isn’t JSON');
    expect(() => readBank64Backup('{"format":"other"}')).toThrow('isn’t a bank 64 backup from this app');
    expect(() => readBank64Backup('{"format":"gp200-bank64","version":1,"slots":[]}')).toThrow('no 64A patch');
  });

  it('names the file by date', () => {
    expect(backupFilename(new Date(2026, 8, 18))).toBe('GP200 bank 64 backup 2026-09-18.json');
  });
});

describe('browser copy', () => {
  beforeEach(() => localStorage.clear());
  it('keeps the last save', () => {
    expect(loadBrowserBackupText()).toBeNull();
    const backup = makeBank64Backup([named('a'), named('b'), named('c')]);
    saveBrowserBackup(backup);
    expect(JSON.parse(loadBrowserBackupText()!)).toEqual(backup);
  });
});

describe('bank64NameChanges', () => {
  const names = () => {
    const list = new Array<string | null>(256).fill('x');
    list[252] = 'UTILITY-1';
    list[253] = 'UTILITY-2';
    list[254] = 'ITZA GP-200';
    list[255] = 'SWAP SLOT';
    return list;
  };
  it('is empty when bank 64 is as protected, or not read yet', () => {
    expect(bank64NameChanges(names())).toEqual([]);
    const unread = names();
    unread[254] = null;
    expect(bank64NameChanges(unread)).toEqual([]);
  });
  it('names each slot that changed', () => {
    const changed = names();
    changed[254] = 'Mr. Brown';
    expect(bank64NameChanges(changed)).toEqual(['64C is now “Mr. Brown”']);
  });
});

describe('restoreBank64', () => {
  function fakePedal(dropKnobAt?: number) {
    const log: string[] = [];
    const slots = new Map<number, GP200Preset>();
    const device: RestoreDevice = {
      async writePresetToSlot(preset, slot) {
        log.push(`write ${slot} as ${preset.patchName}`);
        const stored = structuredClone(preset);
        if (slot === dropKnobAt) stored.effects[0].params[0] = 99;
        slots.set(slot, stored);
        return structuredClone(stored);
      },
      async copySlotOnDevice(from, to, _copied, saveAs) {
        log.push(`${from}->${to} as ${saveAs}`);
        return { ...structuredClone(slots.get(from)!), patchName: saveAs! };
      },
    };
    return { device, log };
  }

  it('writes 64C first, then 64A and 64B under their fixed names, then rebuilds 64D', async () => {
    const pedal = fakePedal();
    const seen: string[] = [];
    const result = await restoreBank64(pedal.device, [named('x'), named('y'), named('z')], (d, t) => seen.push(`${d}/${t}`));
    expect(pedal.log).toEqual([
      'write 254 as ITZA GP-200',
      'write 252 as UTILITY-1',
      'write 253 as UTILITY-2',
      '254->255 as SWAP SLOT',
    ]);
    expect(result.patchName).toBe('ITZA GP-200');
    expect(seen).toEqual(['1/4', '2/4', '3/4', '4/4']);
  });

  it('finishes when the pedal keeps a value its own way, and says which', async () => {
    const pedal = fakePedal(252);
    const missed: string[] = [];
    await restoreBank64(pedal.device, [named('x'), named('y'), named('z')], undefined, missed);
    // 64A is written twice (a value-only miss is retried once), then it carries on.
    expect(pedal.log).toEqual([
      'write 254 as ITZA GP-200', 'write 252 as UTILITY-1', 'write 252 as UTILITY-1',
      'write 253 as UTILITY-2', '254->255 as SWAP SLOT',
    ]);
    expect(missed).toHaveLength(1);
    expect(missed[0]).toMatch(/^64A PRE param 0 99 vs /);
  });
});
