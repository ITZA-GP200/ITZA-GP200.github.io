import { getEffectParams } from '@/core/effectParams';
import { getEffectsByModule, getSlotModule } from '@/core/effectNames';
import { styleFor, type BoardSkin, type ControlStyle } from '@/core/boardSkin';

/** Knob-type params for an effect, the density that drives enclosure width. */
function knobCount(effectId: number): number {
  return getEffectParams(effectId).filter((d) => d.type === 'knob').length;
}

/**
 * Wide-format enclosure (amp-style panel): 5+ knobs don't fit a compact body.
 * This is the *pedal's own* size and stays per-effect, so every effect keeps its
 * natural look. Neighbours don't reflow because the fixed-size bay (isWideSlot)
 * absorbs the difference, not because the pedal itself is forced to a size.
 */
export function isWidePedal(effectId: number): boolean {
  return knobCount(effectId) >= 5;
}

// The *bay* (fixed slot cell) is keyed to the module, not the current effect. A
// slot's module (getSlotModule) is fixed, so the bay size is invariant across
// effect switches; swapping effects only changes the padding inside the bay,
// never a neighbour's position.
//
// A module's bay is wide if any of its effects is wide. This keeps the tall,
// knob-heavy effects (compressors, amps, delays) laid out in 2 rows of knobs
// instead of squeezing them into 3, so bays stay shorter. The board wraps its
// single row and scales to fit (useBoardFit), so a wide bay costs horizontal
// room on a line, never an overflow.
const wideModuleCache = new Map<string, boolean>();
function isWideModule(module: string): boolean {
  const cached = wideModuleCache.get(module);
  if (cached !== undefined) return cached;
  const wide = getEffectsByModule(module).some((e) => isWidePedal(e.effectId));
  wideModuleCache.set(module, wide);
  return wide;
}

/** Wide bay for a slot, stable across effect changes (see above). */
export function isWideSlot(slotIndex: number): boolean {
  return isWideModule(getSlotModule(slotIndex));
}

/**
 * Whether the pedal body renders wide. A pedal is wide only when its own effect
 * is wide *and* its bay is wide, so a rare wide effect in a mostly-compact
 * module (bay is compact) renders compact instead of overflowing/overlapping its
 * neighbours. In a wide bay, compact effects still render compact and float with
 * padding. Either way the body never exceeds its bay, so nothing reflows.
 */
export function pedalIsWide(slotIndex: number, effectId: number): boolean {
  return isWideSlot(slotIndex) && isWidePedal(effectId);
}

/**
 * A key that changes whenever something OTHER than the chain changes how tall
 * a card is — the board's fit (useBoardFit) re-runs on it.
 *
 * It exists because levelling the rows pins a MINIMUM height on every bay, so
 * a change that makes cards SHORTER leaves the observed box exactly as it was
 * and the ResizeObserver never fires. Without this the board stays at the size
 * it grew to: drag Label Size up and back down, or switch the board to bars
 * and back, and nothing would release it.
 *
 * Height comes from the type size and from how the controls stack, so those
 * are what it tracks: a bar card is much taller than the same block as dials,
 * and the style can be set board-wide or overridden on one block.
 *
 * Anything added later that changes a card's height belongs in here.
 */
export function boardHeightKey(labelSize: number): string {
  return String(labelSize);
}

/**
 * Which control each block is drawn with, as a key.
 *
 * Kept apart from boardHeightKey because the two are allowed different
 * things. A label-size change may resize the board; a control-style change
 * may only ever make it smaller, never bigger (see useBoardFit's ceiling) —
 * switching the board to bars must not grow every label on it.
 */
export function boardStyleKey(
  slotIndexes: readonly number[],
  skin: BoardSkin,
  boardStyle: ControlStyle,
): string {
  return slotIndexes.map((slotIndex) => styleFor(skin, slotIndex, boardStyle)[0]).join('');
}

/**
 * Split the chain into fixed rows, as evenly as its length allows.
 *
 * By COUNT, never by what fits. Where a line broke used to be a layout
 * outcome, which is right for enclosures that are all one size and wrong for
 * cards: a card's height follows its control count, so switching one block to
 * bars made the board taller, the zoom search shrank it to fit, more cards
 * then fitted a line, and the chain re-wrapped underneath the user — the EQ
 * would jump from the second row to the first for no reason the user caused.
 *
 * Rows changing height to make room for bars is expected. Pedals changing row
 * while you work is not, so the split is decided from the length alone and
 * nothing about a card can move it.
 */
export function splitChainRows<T>(cells: readonly T[], maxRows: number): T[][] {
  if (cells.length === 0) return [[]];
  const perRow = Math.ceil(cells.length / maxRows);
  const rows: T[][] = [];
  for (let at = 0; at < cells.length; at += perRow) rows.push(cells.slice(at, at + perRow));
  return rows;
}

/**
 * The fewest bars that are worth splitting into two columns.
 *
 * Six is the graphic EQ's band count, and the EQ is the one block where a
 * single column is genuinely unreadable: six full-width bars stack into a
 * card half again as tall as anything beside it. Every other block has three
 * or four, where one bar per row is the clearer read and costs nothing — so
 * the threshold sits above them and below the EQ.
 */
const TWO_COLUMN_BAR_MIN = 5;

/**
 * Whether an effect's bars are drawn two across instead of one per row.
 *
 * By the effect's own control count, not by its bay width: a wide bay means
 * the MODULE has a knob-heavy effect somewhere in it, which caught the
 * three-bar blocks (GREEN OD, TWEEDY, DETUNE, PURE, ROOM) and split them for
 * no reason.
 */
export function barsGoTwoAcross(effectId: number): boolean {
  return knobCount(effectId) >= TWO_COLUMN_BAR_MIN;
}
