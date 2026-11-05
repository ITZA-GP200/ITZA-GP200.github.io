import { describe, expect, it } from 'vitest';
import { boardHeightKey, boardStyleKey } from '@/components/board/boardLayout';
import type { BoardSkin } from '@/core/boardSkin';

const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * The two keys the board's fit watches, and why they are two and not one.
 *
 * Levelling the rows pins a MINIMUM height on every bay, so anything that
 * makes cards shorter leaves the observed box unchanged and the
 * ResizeObserver stays silent — the board would hold the size it grew to.
 * Both keys exist to re-run the fit over that.
 *
 * They are kept apart because the fit treats them differently: a label-size
 * change may resize the board, a control-style change may only ever make it
 * smaller. Bars are the more compact control, so letting a style change raise
 * the scale would mean switching the board to bars grew every label on it.
 */
describe('boardHeightKey', () => {
  it('changes with the label size', () => {
    expect(boardHeightKey(100)).not.toBe(boardHeightKey(130));
  });

  it('carries nothing else, so a style change cannot masquerade as a resize', () => {
    expect(boardHeightKey(100)).toBe('100');
  });
});

describe('boardStyleKey', () => {
  it('changes with the board-wide control style', () => {
    expect(boardStyleKey(SLOTS, {}, 'dial')).not.toBe(boardStyleKey(SLOTS, {}, 'bar'));
  });

  it('changes when one single block overrides the style', () => {
    // the case that is easy to miss: the board setting has not moved
    const oneBar: BoardSkin = { 6: { style: 'bar' } };
    expect(boardStyleKey(SLOTS, oneBar, 'dial')).not.toBe(boardStyleKey(SLOTS, {}, 'dial'));
  });

  it('distinguishes which block was overridden, not just how many', () => {
    const first: BoardSkin = { 0: { style: 'bar' } };
    const last: BoardSkin = { 10: { style: 'bar' } };
    expect(boardStyleKey(SLOTS, first, 'dial')).not.toBe(boardStyleKey(SLOTS, last, 'dial'));
  });

  it('is stable for changes that cannot move a card height', () => {
    // colour and lock are not height; re-fitting on them would be churn
    const painted: BoardSkin = { 2: { color: '#ff5c5c' }, 4: { locked: true } };
    expect(boardStyleKey(SLOTS, painted, 'dial')).toBe(boardStyleKey(SLOTS, {}, 'dial'));
  });

  it('reads an override that matches the board as no change at all', () => {
    const redundant: BoardSkin = { 3: { style: 'dial' } };
    expect(boardStyleKey(SLOTS, redundant, 'dial')).toBe(boardStyleKey(SLOTS, {}, 'dial'));
  });
});
