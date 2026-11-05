import { describe, expect, it } from 'vitest';
import { boardHeightKey } from '@/components/board/boardLayout';
import type { BoardSkin } from '@/core/boardSkin';

const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * The key the board's fit re-runs on.
 *
 * This is not cosmetic bookkeeping. Levelling the rows pins a MINIMUM height
 * on every bay, so anything that makes cards SHORTER leaves the observed box
 * unchanged and the ResizeObserver stays silent — the board would hold the
 * size it grew to and dragging the setting back would not release it. Every
 * input that moves a card's height has to be in here.
 */
describe('boardHeightKey', () => {
  it('changes with the label size', () => {
    const a = boardHeightKey(SLOTS, {}, 'dial', 100);
    const b = boardHeightKey(SLOTS, {}, 'dial', 130);
    expect(a).not.toBe(b);
  });

  it('changes with the board-wide control style', () => {
    // a bar card is much taller than the same block drawn as dials
    expect(boardHeightKey(SLOTS, {}, 'dial', 100)).not.toBe(
      boardHeightKey(SLOTS, {}, 'bar', 100),
    );
  });

  it('changes when one single block overrides the style', () => {
    // the case that is easy to miss: the board setting has not moved
    const plain = boardHeightKey(SLOTS, {}, 'dial', 100);
    const oneBar: BoardSkin = { 6: { style: 'bar' } };
    expect(boardHeightKey(SLOTS, oneBar, 'dial', 100)).not.toBe(plain);
  });

  it('is stable for changes that cannot move a card height', () => {
    // colour and lock are not height; re-fitting on them would be churn
    const plain = boardHeightKey(SLOTS, {}, 'dial', 100);
    const painted: BoardSkin = { 2: { color: '#ff5c5c' }, 4: { locked: true } };
    expect(boardHeightKey(SLOTS, painted, 'dial', 100)).toBe(plain);
  });

  it('distinguishes which block was overridden, not just how many', () => {
    const first: BoardSkin = { 0: { style: 'bar' } };
    const last: BoardSkin = { 10: { style: 'bar' } };
    expect(boardHeightKey(SLOTS, first, 'dial', 100)).not.toBe(
      boardHeightKey(SLOTS, last, 'dial', 100),
    );
  });

  it('reads an override that matches the board as no change at all', () => {
    const redundant: BoardSkin = { 3: { style: 'dial' } };
    expect(boardHeightKey(SLOTS, redundant, 'dial', 100)).toBe(
      boardHeightKey(SLOTS, {}, 'dial', 100),
    );
  });
});
