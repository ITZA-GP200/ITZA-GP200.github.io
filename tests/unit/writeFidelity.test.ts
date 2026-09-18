import { describe, expect, it } from 'vitest';
import { createDefaultPreset } from '@/core/defaultPreset';
import { describeWriteFidelity, summarizeWriteFidelity } from '@/core/writeFidelity';

describe('describeWriteFidelity', () => {
  it('reports a faithful write as all matching', () => {
    const sent = createDefaultPreset();
    const result = describeWriteFidelity(structuredClone(sent), sent);
    expect(result).toEqual({ identity: [], values: [], extras: [] });
    expect(summarizeWriteFidelity('12A', 'X', result)).toBe(
      'WRITE TEST 12A "X". Name/blocks: all match. Knobs/volume: all match. Extras: all match. Full list in the console',
    );
  });

  it('flags what the live push may not carry', () => {
    const sent = { ...createDefaultPreset(), patchStyle: 3, fxLoopMode: 1, author: 'Itza' };
    const actual = { ...createDefaultPreset(), patchStyle: 0, fxLoopMode: 0 };
    const { extras } = describeWriteFidelity(actual, sent);
    expect(extras).toEqual(['FX loop mode 0 vs 1', 'style 0 vs 3', 'author "" vs "Itza"']);
  });

  it('keeps the banner short but counts everything', () => {
    const summary = summarizeWriteFidelity('1A', 'N', { identity: [], values: ['a', 'b', 'c', 'd'], extras: [] });
    expect(summary).toContain('Knobs/volume: 4 differ (a; b; c; …)');
  });
});

describe('describeWriteFidelity: knob slots', () => {
  it('ignores leftover slots the effect doesn’t use, but flags its real knobs', () => {
    const sent = createDefaultPreset();
    const cab = sent.effects.find((effect) => effect.slotIndex === 5)!;
    cab.effectId = 167772200; // Solo cab: Volume (1), Low Cut (5), High Cut (6)
    const actual = structuredClone(sent);
    const got = actual.effects.find((effect) => effect.slotIndex === 5)!;
    got.params[0] = (cab.params[0] ?? 0) + 1; // leftover slot
    got.params[2] = (cab.params[2] ?? 0) + 30; // leftover slot
    got.params[1] = 0;
    cab.params[1] = 75; // Volume, real
    const { values } = describeWriteFidelity(actual, sent);
    expect(values).toEqual(['CAB param 1 0 vs 75']);
  });
});
