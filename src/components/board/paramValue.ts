import type { KnobParam } from '@/core/effectParams';
import { noteIndex, noteLabel, noteValue } from '@/core/tempoSync';
import { fineStep, keyStep } from './knobGeometry';

/**
 * How a knob moves right now. `synced`: its Sync switch is on, so it steps
 * through note values (core/tempoSync.ts). `fine`: Shift is held, so a step is
 * the param's own resolution even on a wide knob (see keyStep).
 */
export interface KnobMode {
  synced?: boolean;
  fine?: boolean;
}

/** Clamp to the param's range and snap to its step. */
export function clampSnap(raw: number, param: KnobParam): number {
  const clamped = Math.min(param.max, Math.max(param.min, raw));
  const step = fineStep(param);
  return Math.round(clamped / step) * step;
}

/** Snap a raw drag position: to the step, or to the nearest note when synced. */
export function snapValue(raw: number, param: KnobParam, synced = false): number {
  if (synced) return noteValue(noteIndex(raw, param), param);
  return clampSnap(raw, param);
}

/** Move `notches` keyboard presses / wheel notches from `value`. */
export function stepValue(
  value: number,
  param: KnobParam,
  notches: number,
  mode: KnobMode = {},
): number {
  if (mode.synced) return noteValue(noteIndex(value, param) + notches, param);
  const step = keyStep(param, mode.fine);
  return clampSnap(value + notches * step, param);
}

/** Readout text: decimals inferred from step, `+` prefix on bipolar params. */
export function formatValue(value: number, param: KnobParam, synced = false): string {
  if (synced) return noteLabel(value, param);
  let dp = 0;
  if (param.step > 0 && param.step < 1) dp = 1;
  const v = Number(value.toFixed(dp));
  let sign = '';
  if (param.min < 0 && v > 0) sign = '+';
  return `${sign}${v}`;
}

/** The plain number a value entry field starts from (no `+`, no note label). */
export function entryText(value: number, param: KnobParam): string {
  let dp = 0;
  if (param.step > 0 && param.step < 1) dp = 1;
  return String(Number(value.toFixed(dp)));
}

/**
 * A typed value, clamped and snapped, or null if the text holds no number.
 * Forgiving about what people actually type: a decimal comma, a leading `+`,
 * and a trailing unit (`350ms`, `0.5 Hz`) all parse.
 */
export function parseEntry(text: string, param: KnobParam): number | null {
  const parsed = parseFloat(text.trim().replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  return clampSnap(parsed, param);
}

/**
 * Whether a param's NAME is really a unit reading rather than a word.
 *
 * The EQ bands are called "125Hz", "1.6kHz", "4kHz"; the skin sets control
 * labels in caps, which turns those into "125HZ" and "1.6KHZ" — a unit written
 * in the wrong case reads as a typo, and these are the one place a name
 * carries one. A leading digit is the whole test, because that is exactly what
 * separates a reading from a word: no param in effectParams.ts begins with a
 * digit unless it is a frequency.
 *
 * It decides a CSS class, not the text, so the name a screen reader announces
 * and the name in the source are untouched either way.
 */
export function isUnitName(name: string): boolean {
  return /^\d/.test(name);
}

/**
 * The class a control label is drawn with: its own, plus `as-written` when the
 * name is a unit reading the skin must not uppercase (see isUnitName).
 *
 * Shared because four controls draw the same label — the dial, the fader, the
 * switch and the bar — and a rule that only three of them obeyed would show up
 * as one EQ band shouting at the others.
 */
export function labelClass(name: string, base = 'k-label'): string {
  return isUnitName(name) ? `${base} as-written` : base;
}
