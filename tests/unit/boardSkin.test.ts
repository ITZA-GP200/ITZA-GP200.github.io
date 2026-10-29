import { beforeEach, describe, expect, it } from 'vitest';
import {
  SKIN_PALETTE,
  clearStyleOverrides,
  blockSkin,
  isLocked,
  loadBoardSkin,
  loadBoardStyle,
  saveBoardSkin,
  saveBoardStyle,
  styleFor,
  withBlock,
  type BlockSkin,
  type BoardSkin,
} from '@/core/boardSkin';

describe('boardSkin: what a block renders with', () => {
  it('falls back to the board until a block says otherwise', () => {
    const skin: BoardSkin = { 8: { style: 'bar' } };
    expect(styleFor(skin, 8, 'dial')).toBe('bar'); // its own
    expect(styleFor(skin, 2, 'dial')).toBe('dial'); // the board's
    expect(styleFor({}, 2, 'bar')).toBe('bar');
  });

  it('drops a block entirely once nothing is set on it', () => {
    let skin = withBlock({}, 3, { locked: true });
    expect(isLocked(skin, 3)).toBe(true);
    skin = withBlock(skin, 3, { locked: undefined });
    expect(skin[3]).toBeUndefined();
  });

  it('keeps other settings when one changes', () => {
    let skin = withBlock({}, 5, { color: SKIN_PALETTE[2] });
    skin = withBlock(skin, 5, { style: 'bar' });
    expect(blockSkin(skin, 5)).toEqual({ color: SKIN_PALETTE[2], style: 'bar' });
  });
});

describe('boardSkin: the board-wide style button', () => {
  it('clears per-block overrides so the whole board obeys it', () => {
    const skin: BoardSkin = { 1: { style: 'bar' }, 2: { style: 'dial', color: SKIN_PALETTE[0] } };
    const next = clearStyleOverrides(skin, 'dial');
    expect(next[1]).toBeUndefined();              // nothing left to keep
    expect(next[2]).toEqual({ color: SKIN_PALETTE[0] }); // colour survives, style doesn't
    expect(styleFor(next, 1, 'bar')).toBe('bar');
    expect(styleFor(next, 2, 'bar')).toBe('bar');
  });

  it('leaves a locked block exactly as it looks, even with no style of its own', () => {
    // Locked while simply following the board: it must not move when the
    // board does, so today's style is written down.
    const skin: BoardSkin = { 7: { locked: true } };
    const next = clearStyleOverrides(skin, 'dial');
    expect(styleFor(next, 7, 'bar')).toBe('dial');
    expect(isLocked(next, 7)).toBe(true);
  });

  it('leaves a locked block with its own style alone', () => {
    const skin: BoardSkin = { 7: { locked: true, style: 'dial' } };
    expect(styleFor(clearStyleOverrides(skin, 'bar'), 7, 'bar')).toBe('dial');
  });
});

describe('boardSkin: storage', () => {
  beforeEach(() => localStorage.clear());

  it('survives a round trip', () => {
    const skin: BoardSkin = { 0: { color: SKIN_PALETTE[5], style: 'bar' }, 9: { locked: true } };
    saveBoardSkin(skin);
    expect(loadBoardSkin()).toEqual(skin);
    saveBoardStyle('bar');
    expect(loadBoardStyle()).toBe('bar');
  });

  it('defaults to dials with nothing stored', () => {
    expect(loadBoardSkin()).toEqual({});
    expect(loadBoardStyle()).toBe('dial');
  });

  it('refuses rubbish rather than painting a block unreadable', () => {
    localStorage.setItem('gp200:boardSkin', JSON.stringify({
      2: { color: '#000000' },        // not in the palette
      3: { style: 'squiggle' },       // not a style
      99: { locked: true },           // not a block
      4: { locked: true, color: SKIN_PALETTE[1] },
    }));
    expect(loadBoardSkin()).toEqual({ 4: { locked: true, color: SKIN_PALETTE[1] } });
  });

  it('shrugs off a corrupt value', () => {
    localStorage.setItem('gp200:boardSkin', 'not json');
    expect(loadBoardSkin()).toEqual({});
    localStorage.setItem('gp200:boardStyle', 'nonsense');
    expect(loadBoardStyle()).toBe('dial');
  });
});

/**
 * The lock guard lives in App.handleBlockSkinChange, but its shape is the
 * thing worth pinning: a change that CARRIES a locked key is a change to the
 * lock itself and must get through, even when that key's value is undefined.
 * Testing `change.locked === undefined` made the lock one-way.
 */
describe('boardSkin: the lock can always be undone', () => {
  const allowed = (skin: BoardSkin, slot: number, change: BlockSkin) =>
    !(isLocked(skin, slot) && !('locked' in change));

  it('lets the lock itself be turned off', () => {
    const skin = withBlock({}, 4, { locked: true });
    expect(allowed(skin, 4, { locked: undefined })).toBe(true);
    const next = withBlock(skin, 4, { locked: undefined });
    expect(isLocked(next, 4)).toBe(false);
  });

  it('still refuses a colour or a style while locked', () => {
    const skin = withBlock({}, 4, { locked: true });
    expect(allowed(skin, 4, { color: SKIN_PALETTE[0] })).toBe(false);
    expect(allowed(skin, 4, { style: 'bar' })).toBe(false);
  });

  it('allows anything on a block that is not locked', () => {
    expect(allowed({}, 4, { color: SKIN_PALETTE[0] })).toBe(true);
    expect(allowed({}, 4, { locked: true })).toBe(true);
  });
});
