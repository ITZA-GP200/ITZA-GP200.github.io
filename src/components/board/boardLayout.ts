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
export function boardHeightKey(
  slotIndexes: readonly number[],
  skin: BoardSkin,
  boardStyle: ControlStyle,
  labelSize: number,
): string {
  const styles = slotIndexes.map((slotIndex) => styleFor(skin, slotIndex, boardStyle)[0]).join('');
  return `${labelSize}|${styles}`;
}
