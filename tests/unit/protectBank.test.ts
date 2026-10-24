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
      'write 254 as ITZA GP-200',
      '254->252 as UTILITY-1',
      '254->253 as UTILITY-2',
      '254->255 as SWAP SLOT',
    ]);
    expect([252, 253, 254, 255].map(pedal.nameAt)).toEqual(['UTILITY-1', 'UTILITY-2', 'ITZA GP-200', 'SWAP SLOT']);
    expect(result.patchName).toBe('ITZA GP-200');
  });

  it('needs nothing on the pedal first and leaves the shipped patch untouched', async () => {
    const pedal = fakePedal({});
    const shipped = patch("It's GP-200");
    await protectBank64(pedal.device, shipped);
    expect(shipped.patchName).toBe("It's GP-200");
  });

  it('carries on, noting it, when the pedal keeps a knob its own way', async () => {
    const pedal = fakePedal({}, { dropKnob: true });
    const missed: string[] = [];
    await protectBank64(pedal.device, patch("It's GP-200"), undefined, missed);
    expect(pedal.log.slice(0, 2)).toEqual(['write 254 as ITZA GP-200', 'write 254 as ITZA GP-200']);
    expect(pedal.log).toHaveLength(5);
    expect(missed[0]).toMatch(/^64C PRE param 0 99 vs /);
  });

  it('stops when the write lands with the wrong name or effects', async () => {
    const pedal = fakePedal({});
    pedal.device.writePresetToSlot = async (preset) => ({ ...preset, patchName: 'something else' });
    await expect(protectBank64(pedal.device, patch("It's GP-200")))
      .rejects.toThrow('64C didn’t take the shipped patch');
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
    expect(pasteProblem([0], 254, true)).toBeNull();
  });
});

describe('protected bank 64 pastes', () => {
  it('lets a paste land in 64A–64C, keeping each slot’s fixed name, but never in 64D', async () => {
    expect(pasteProblem([0, 1, 2], 252, true)).toBeNull();
    expect(pasteProblem([0, 1, 2, 3], 252, true)).toBe('Bank 64 is protected: 64D is the swap slot');
    expect(pasteProblem([0], 255, true)).toBe('Bank 64 is protected: 64D is the swap slot');
    const saved: string[] = [];
    const device = {
      async copySlotOnDevice(_from: number, to: number, copied: GP200Preset, saveAs?: string) {
        saved.push(`${to}:${saveAs ?? copied.patchName}`);
        return { ...copied, patchName: saveAs ?? copied.patchName };
      },
    };
    const { pasteMany } = await import('@/core/multiPaste');
    await pasteMany(device, [{ slot: 0, preset: patch('Clean') }, { slot: 1, preset: patch('Crunch') }], 252, {
      bank64Protected: true,
    });
    expect(saved).toEqual(['252:UTILITY-1', '253:UTILITY-2']);
    saved.length = 0;
    await pasteMany(device, [{ slot: 0, preset: patch('Clean') }], 251, { bank64Protected: true });
    expect(saved).toEqual(['251:Clean']);
  });
});

describe('writeChecked', () => {
  it('writes once more when only knob values missed, then succeeds', async () => {
    let calls = 0;
    const device = {
      async writePresetToSlot(preset: GP200Preset) {
        calls += 1;
        const stored = structuredClone(preset);
        if (calls === 1) stored.effects[0].params[0] = 99;
        return stored;
      },
    };
    const { writeChecked } = await import('@/core/protectBank');
    const result = await writeChecked(device, patch('X'), 252, (d) => `bad: ${d}`);
    expect(calls).toBe(2);
    expect(result.patchName).toBe('X');
  });

  it('notes a value still off after the second write, and fails at once on a wrong name', async () => {
    const { writeChecked } = await import('@/core/protectBank');
    let calls = 0;
    const alwaysOff = { async writePresetToSlot(preset: GP200Preset) { calls += 1; const s = structuredClone(preset); s.effects[0].params[0] = 99; return s; } };
    const missed: string[] = [];
    await writeChecked(alwaysOff, patch('X'), 252, (d) => `bad: ${d}`, missed);
    expect(calls).toBe(2);
    expect(missed).toHaveLength(1);
    calls = 0;
    const wrongName = { async writePresetToSlot(preset: GP200Preset) { calls += 1; return { ...preset, patchName: 'other' }; } };
    await expect(writeChecked(wrongName, patch('X'), 252, (d) => `bad: ${d}`)).rejects.toThrow('bad:');
    expect(calls).toBe(1);
  });
});

describe('protectBank64: not doing work that is already done', () => {
  it('skips the write when 64C already holds the shipped patch', async () => {
    const shipped = patch("It's GP-200");
    const slots = new Map<number, GP200Preset>([[254, { ...structuredClone(shipped), patchName: 'ITZA GP-200' }]]);
    const log: string[] = [];
    const device: ProtectDevice = {
      async pullPreset(slot) {
        const held = slots.get(slot);
        if (!held) throw new Error('unreadable');
        return structuredClone(held);
      },
      async writePresetToSlot(preset, slot) {
        log.push(`write ${slot}`);
        slots.set(slot, structuredClone(preset));
        return structuredClone(preset);
      },
      async copySlotOnDevice(from, to, _copied, saveAs) {
        log.push(`${from}->${to} as ${saveAs}`);
        const copy = { ...structuredClone(slots.get(from)!), patchName: saveAs! };
        slots.set(to, copy);
        return structuredClone(copy);
      },
    };
    const result = await protectBank64(device, shipped);
    // No write at all: 64C was right, the other three are copies of it.
    expect(log).toEqual(['254->252 as UTILITY-1', '254->253 as UTILITY-2', '254->255 as SWAP SLOT']);
    expect(result.patchName).toBe('ITZA GP-200');
  });
});

describe('writeChecked: not arguing with the pedal twice', () => {
  beforeEach(() => localStorage.clear());

  it('writes once more the first time a value is refused, then remembers it', async () => {
    const { writeChecked } = await import('@/core/protectBank');
    const { loadStubbornValues } = await import('@/core/stubbornValues');
    const refusing = {
      calls: 0,
      async writePresetToSlot(preset: GP200Preset) {
        refusing.calls += 1;
        const stored = structuredClone(preset);
        stored.effects[0].params[1] = 50; // the pedal's own value, always
        return stored;
      },
    };
    const sent = patch('X');
    sent.effects[0].params[1] = 0;

    const missed: string[] = [];
    await writeChecked(refusing, sent, 252, (d) => `bad: ${d}`, missed, loadStubbornValues());
    expect(refusing.calls).toBe(2); // tried again, to be sure
    expect(missed).toHaveLength(1);

    // Next time the same control is refused, one write is enough.
    refusing.calls = 0;
    const missedAgain: string[] = [];
    await writeChecked(refusing, sent, 252, (d) => `bad: ${d}`, missedAgain, loadStubbornValues());
    expect(refusing.calls).toBe(1);
    expect(missedAgain).toHaveLength(1);
  });

  it('still retries a value it has no reason to doubt', async () => {
    const { writeChecked } = await import('@/core/protectBank');
    let calls = 0;
    const flaky = {
      async writePresetToSlot(preset: GP200Preset) {
        calls += 1;
        const stored = structuredClone(preset);
        if (calls === 1) stored.effects[0].params[1] = 99; // a one-off miss
        return stored;
      },
    };
    const sent = patch('X');
    const missed: string[] = [];
    const result = await writeChecked(flaky, sent, 252, (d) => `bad: ${d}`, missed);
    expect(calls).toBe(2);
    expect(missed).toEqual([]); // the second write landed
    expect(result.patchName).toBe('X');
  });
});

describe('writeChecked: the cheap second attempt', () => {
  beforeEach(() => localStorage.clear());

  it('sends only the missed controls again, instead of the whole patch', async () => {
    const { writeChecked } = await import('@/core/protectBank');
    let writes = 0;
    const touched: { slotIndex: number; param: number; want: number }[] = [];
    const pedal = {
      async writePresetToSlot(preset: GP200Preset) {
        writes += 1;
        const stored = structuredClone(preset);
        stored.effects[0].params[1] = 99; // one knob swallowed on the way in
        return stored;
      },
      async retouchParams(_slot: number, name: string, controls: readonly { slotIndex: number; effectId: number; param: number; want: number }[]) {
        touched.push(...controls.map(({ slotIndex, param, want }) => ({ slotIndex, param, want })));
        // Sent on its own, it lands.
        const stored = patch(name);
        for (const control of controls) {
          stored.effects.find((effect) => effect.slotIndex === control.slotIndex)!.params[control.param] = control.want;
        }
        return stored;
      },
    };
    const sent = patch('X');
    const missed: string[] = [];
    const result = await writeChecked(pedal, sent, 252, (d) => `bad: ${d}`, missed);

    expect(writes).toBe(1); // the 10-20 s write happened once
    expect(touched).toEqual([{ slotIndex: sent.effects[0].slotIndex, param: 1, want: sent.effects[0].params[1] }]);
    expect(missed).toEqual([]);
    expect(result.effects[0].params[1]).toBe(sent.effects[0].params[1]);
  });

  it('reports and remembers a control that survives being sent on its own', async () => {
    const { writeChecked } = await import('@/core/protectBank');
    const { loadStubbornValues } = await import('@/core/stubbornValues');
    let writes = 0;
    let retouches = 0;
    const refuse = (preset: GP200Preset) => {
      const stored = structuredClone(preset);
      stored.effects[0].params[1] = 50; // the pedal's own value, whatever is sent
      return stored;
    };
    const pedal = {
      async writePresetToSlot(preset: GP200Preset) { writes += 1; return refuse(preset); },
      async retouchParams(_slot: number, name: string) { retouches += 1; return refuse(patch(name)); },
    };
    const sent = patch('X');
    sent.effects[0].params[1] = 0;

    const missed: string[] = [];
    await writeChecked(pedal, sent, 252, (d) => `bad: ${d}`, missed, loadStubbornValues());
    expect(writes).toBe(1);
    expect(retouches).toBe(1);
    expect(missed).toHaveLength(1);
    expect(loadStubbornValues().size).toBe(1);

    // Known from now on: nothing is sent twice for it again.
    writes = 0; retouches = 0;
    await writeChecked(pedal, sent, 252, (d) => `bad: ${d}`, [], loadStubbornValues());
    expect(writes).toBe(1);
    expect(retouches).toBe(0);
  });
});
