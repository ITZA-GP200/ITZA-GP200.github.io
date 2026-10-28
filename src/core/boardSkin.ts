/**
 * Per-block board preferences: key colour, control style, and lock.
 *
 * Keyed by **block position** (slotIndex 0-10), not by effect or by patch, so
 * "my delay slot shows bars" holds whatever patch is loaded. Eleven decisions
 * rather than hundreds, and it matches how a board is thought about.
 *
 * None of this can live on the pedal: the GP-200's patch format has no field
 * for a colour or a control style, so it cannot ride in a .prst either. It is
 * this browser's state, alongside gp200:protect64, gp200:defaultPatch,
 * gp200:swapSlot and gp200:stubbornValues — and like those, it belongs in the
 * exported profile, because clearing site data wipes it.
 */

/** Control style for a block: the app's dials, or faders/bars. */
export type ControlStyle = 'dial' | 'bar';

export interface BlockSkin {
  /** Key colour; undefined means the effect's own artwork colour. */
  color?: string;
  /** Control style; undefined means whatever the board's global setting is. */
  style?: ControlStyle;
  /** Locked: the control style and the values are frozen. Position and the
   *  on/off switch are deliberately NOT frozen. */
  locked?: boolean;
}

/** slotIndex -> preferences. Absent keys simply have no preference. */
export type BoardSkin = Record<number, BlockSkin>;

/**
 * Sixteen bright keys, spread around the wheel so neighbouring blocks never
 * look alike. Only these are offered: a free colour picker produces muddy
 * choices that fail against the dark field.
 */
export const SKIN_PALETTE: readonly string[] = [
  '#ff5c5c', '#ff8c42', '#ffc94a', '#ffe95c',
  '#b6e04a', '#4ade80', '#2fd4a7', '#3fc9d9',
  '#4fd6ee', '#5a8ff0', '#7c6cf0', '#a06ae8',
  '#d86ae8', '#ff6ab0', '#ff7a8a', '#c9d1d9',
];

/**
 * The key colour a block starts with, by module.
 *
 * Deliberately NOT the enclosure body from boardPalette: those are chosen to
 * look like real hardware, and several are nearly black (AMP #211d18, VOL
 * #2e2e33). On a dark card that reads as no colour at all — the name and the
 * on/off bar vanish. These are picked from the palette instead, spread so two
 * neighbouring blocks never look alike.
 */
export const DEFAULT_KEY: Record<string, string> = {
  PRE: '#ffc94a',
  WAH: '#a06ae8',
  DST: '#ff5c5c',
  AMP: '#ff8c42',
  NR: '#c9d1d9',
  CAB: '#ffe95c',
  EQ: '#b6e04a',
  MOD: '#5a8ff0',
  DLY: '#7c6cf0',
  RVB: '#3fc9d9',
  VOL: '#2fd4a7',
};

/** The colour a block is drawn in: its own choice, else the module default. */
export function keyColorFor(skin: BoardSkin, slotIndex: number, moduleName: string): string {
  return blockSkin(skin, slotIndex).color ?? DEFAULT_KEY[moduleName] ?? '#c9d1d9';
}

const STORAGE_KEY = 'gp200:boardSkin';
const STYLE_KEY = 'gp200:boardStyle';

const isStyle = (v: unknown): v is ControlStyle => v === 'dial' || v === 'bar';

/** The board-wide control style, used by any block with no preference. */
export function loadBoardStyle(): ControlStyle {
  try {
    const raw = localStorage.getItem(STYLE_KEY);
    return isStyle(raw) ? raw : 'dial';
  } catch {
    return 'dial';
  }
}

export function saveBoardStyle(style: ControlStyle): void {
  try {
    localStorage.setItem(STYLE_KEY, style);
  } catch {
    // Storage unavailable: the choice just won't survive a reload.
  }
}

export function loadBoardSkin(): BoardSkin {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: BoardSkin = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const slot = Number(key);
      if (!Number.isInteger(slot) || slot < 0 || slot > 10) continue;
      if (!value || typeof value !== 'object') continue;
      const { color, style, locked } = value as BlockSkin;
      const entry: BlockSkin = {};
      // Only a colour from the palette: a hand-edited file shouldn't be able
      // to paint a block something unreadable.
      if (typeof color === 'string' && SKIN_PALETTE.includes(color)) entry.color = color;
      if (isStyle(style)) entry.style = style;
      if (locked === true) entry.locked = true;
      if (Object.keys(entry).length > 0) out[slot] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveBoardSkin(skin: BoardSkin): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(skin));
  } catch {
    // Storage unavailable: preferences just won't survive a reload.
  }
}

/** One block's preferences, never undefined. */
export function blockSkin(skin: BoardSkin, slotIndex: number): BlockSkin {
  return skin[slotIndex] ?? {};
}

/** The style a block actually renders with: its own, else the board's. */
export function styleFor(skin: BoardSkin, slotIndex: number, board: ControlStyle): ControlStyle {
  return blockSkin(skin, slotIndex).style ?? board;
}

export const isLocked = (skin: BoardSkin, slotIndex: number): boolean =>
  blockSkin(skin, slotIndex).locked === true;

/** Change one block, dropping the entry entirely when nothing is left set. */
export function withBlock(skin: BoardSkin, slotIndex: number, change: BlockSkin): BoardSkin {
  const next = { ...skin, [slotIndex]: { ...blockSkin(skin, slotIndex), ...change } };
  for (const [key, value] of Object.entries(next[slotIndex])) {
    if (value === undefined) delete (next[slotIndex] as Record<string, unknown>)[key];
  }
  if (Object.keys(next[slotIndex]).length === 0) delete next[slotIndex];
  return next;
}

/**
 * Clear every per-block style override that isn't locked, so the board-wide
 * toggle really does mean "make the whole board look like this" — a block
 * holding an old override would quietly disobey it. The caller sets the board
 * style itself (saveBoardStyle); this only decides what stops overriding it.
 */
export function clearStyleOverrides(
  skin: BoardSkin,
  /** What the board shows right now, so a locked block that was simply
   *  following it can be pinned before it moves out from under them. */
  currentBoard: ControlStyle,
): BoardSkin {
  const next: BoardSkin = {};
  for (const [key, value] of Object.entries(skin)) {
    const slot = Number(key);
    if (value.locked) {
      // A locked block with no style of its own was following the board. Write
      // today's style down, or changing the board would change it too — which
      // is exactly what the lock exists to prevent.
      next[slot] = { ...value, style: value.style ?? currentBoard };
      continue;
    }
    const rest: BlockSkin = { ...value };
    delete rest.style;
    if (Object.keys(rest).length > 0) next[slot] = rest;
  }
  return next;
}
