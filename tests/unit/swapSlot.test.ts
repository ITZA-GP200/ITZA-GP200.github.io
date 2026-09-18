import { beforeEach, describe, expect, it } from 'vitest';
import { loadSwapSlot, saveSwapSlot } from '@/core/swapSlot';

describe('swap slot storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('has no swap slot until one is set', () => {
    expect(loadSwapSlot()).toBeNull();
  });

  it('round-trips a slot, including the first and last', () => {
    for (const slot of [0, 155, 255]) {
      saveSwapSlot(slot);
      expect(loadSwapSlot()).toBe(slot);
    }
  });

  it('ignores stored values that are not a slot', () => {
    for (const bad of ['', 'x', '256', '-1', '3.5']) {
      localStorage.setItem('gp200:swapSlot', bad);
      expect(loadSwapSlot()).toBeNull();
    }
  });
});
