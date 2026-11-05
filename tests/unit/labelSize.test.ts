import { beforeEach, describe, expect, it } from 'vitest';
import {
  LABEL_SIZE_DEFAULT,
  LABEL_SIZE_MAX,
  LABEL_SIZE_MIN,
  clampLabelSize,
  loadLabelSize,
  saveLabelSize,
} from '@/core/boardSkin';

/**
 * Label Size: the board-wide scale applied to every control label.
 *
 * The range is the contract the CSS depends on — a knob label is 64px wide and
 * wraps rather than overflowing, so a size above the ceiling would take three
 * lines per label. Junk from a hand-edited profile has to land on the default
 * rather than on NaN, which would blank every label at once.
 */
describe('label size', () => {
  beforeEach(() => localStorage.clear());

  it('starts at the size the skin shipped with', () => {
    expect(loadLabelSize()).toBe(LABEL_SIZE_DEFAULT);
    expect(LABEL_SIZE_DEFAULT).toBe(100);
  });

  it('clamps to the slider range at both ends', () => {
    expect(clampLabelSize(LABEL_SIZE_MIN - 40)).toBe(LABEL_SIZE_MIN);
    expect(clampLabelSize(LABEL_SIZE_MAX + 400)).toBe(LABEL_SIZE_MAX);
    expect(clampLabelSize(120)).toBe(120);
  });

  it('rounds to a whole percent and refuses junk', () => {
    expect(clampLabelSize(117.4)).toBe(117);
    expect(clampLabelSize('130')).toBe(130);
    expect(clampLabelSize('huge')).toBe(LABEL_SIZE_DEFAULT);
    expect(clampLabelSize(undefined)).toBe(LABEL_SIZE_DEFAULT);
    expect(clampLabelSize(Number.NaN)).toBe(LABEL_SIZE_DEFAULT);
  });

  it('survives a reload, clamped on the way in as well as out', () => {
    saveLabelSize(125);
    expect(localStorage.getItem('gp200:labelSize')).toBe('125');
    expect(loadLabelSize()).toBe(125);
    localStorage.setItem('gp200:labelSize', '9000');
    expect(loadLabelSize()).toBe(LABEL_SIZE_MAX);
  });

  it('stays under the two-column cliff', () => {
    // A label's column is 64px * k and a card has 188px of inside with a 10px
    // gutter, so two columns stop fitting at k = 1.36. Past that every card
    // drops to one control per row, doubles in height, and the board stops
    // fitting the stage. The ceiling has to keep clear of it.
    const twoColumnLimit = (188 + 10) / (2 * 64);
    expect(LABEL_SIZE_MAX / 100).toBeLessThan(twoColumnLimit);
  });

  it('pulls an over-large stored value back down on load', () => {
    // A board left at a size from before the ceiling moved must come back
    // inside it by itself, rather than reopening in the state that broke.
    localStorage.setItem('gp200:labelSize', '170');
    expect(loadLabelSize()).toBe(LABEL_SIZE_MAX);
  });

  it('is one of the keys the exported profile carries', async () => {
    const { readSettings } = await import('@/core/profile');
    saveLabelSize(125);
    expect(readSettings()['gp200:labelSize']).toBe('125');
  });
});
