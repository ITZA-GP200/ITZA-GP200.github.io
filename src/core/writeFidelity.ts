import { getEffectParams } from './effectParams';
import { getSlotModule } from './effectNames';
import { describePatchDifferences, type PatchDifferences } from './samePatch';
import type { GP200Preset } from './types';

/**
 * How faithfully the pedal kept a patch written from app data (the live
 * edit-buffer push, then a save), for the WRITE TEST experiment.
 *
 * On top of the usual identity / values split, `extras` covers what the live
 * push may not carry at all (per the fork-1 notes): block order, FX-loop
 * settings, style, note, author, and the EXP / CTRL assignments.
 */
export interface WriteFidelity extends PatchDifferences {
  extras: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Knob differences only for knobs the block's effect actually has. The pedal
 * stores 15 slots per block whatever the effect; the unused ones hold
 * leftovers from earlier effects and mean nothing (M-Vibe has 3 knobs, yet
 * slot 4 differed on hardware). Unknown effects compare every slot.
 */
/** One knob the pedal stored differently, with a key naming the control
 *  itself (effect and parameter) so a refusal can be remembered. */
export interface KnobDifference {
  /** "7000023:3" — the effect, then the parameter inside it. */
  key: string;
  /** "AMP param 3 50 vs 0", for people. */
  line: string;
}

export function knobDifferenceList(actual: GP200Preset, sent: GP200Preset): KnobDifference[] {
  const out: KnobDifference[] = [];
  for (const want of sent.effects) {
    const got = actual.effects.find((effect) => effect.slotIndex === want.slotIndex);
    if (!got) continue;
    const defined = getEffectParams(want.effectId).map((param) => param.idx);
    const slots = defined.length > 0 ? defined : want.params.map((_, index) => index);
    for (const index of slots) {
      if (!Object.is(got.params[index], want.params[index])) {
        out.push({
          key: `${want.effectId.toString(16)}:${index}`,
          line: `${getSlotModule(want.slotIndex)} param ${index} ${got.params[index]} vs ${want.params[index]}`,
        });
      }
    }
  }
  return out;
}

function knobDifferences(actual: GP200Preset, sent: GP200Preset): string[] {
  return knobDifferenceList(actual, sent).map((difference) => difference.line);
}

export function describeWriteFidelity(actual: GP200Preset, sent: GP200Preset): WriteFidelity {
  const { identity, values: allValues } = describePatchDifferences(actual, sent);
  // Patch volume / pan / tempo lines, then the knobs that exist.
  const values = [...allValues.filter((line) => !line.includes(' param ')), ...knobDifferences(actual, sent)];
  const extras: string[] = [];
  const order = (preset: GP200Preset) => preset.effects.map((effect) => effect.slotIndex).join(',');
  if (order(actual) !== order(sent)) extras.push(`block order ${order(actual)} vs ${order(sent)}`);
  if (actual.fxLoopSend !== sent.fxLoopSend || actual.fxLoopReturn !== sent.fxLoopReturn) {
    extras.push(`FX loop points ${actual.fxLoopSend}/${actual.fxLoopReturn} vs ${sent.fxLoopSend}/${sent.fxLoopReturn}`);
  }
  if (actual.fxLoopMode !== sent.fxLoopMode) extras.push(`FX loop mode ${actual.fxLoopMode} vs ${sent.fxLoopMode}`);
  if (actual.patchStyle !== sent.patchStyle) extras.push(`style ${actual.patchStyle} vs ${sent.patchStyle}`);
  if ((actual.patchNote ?? '') !== (sent.patchNote ?? '')) extras.push('note differs');
  if ((actual.author ?? '') !== (sent.author ?? '')) extras.push(`author "${actual.author ?? ''}" vs "${sent.author ?? ''}"`);
  // Say which footswitch / expression slot differs, and how.
  for (const want of sent.ctrlAssignments ?? []) {
    const got = actual.ctrlAssignments?.find((ctrl) => ctrl.ctrlIndex === want.ctrlIndex);
    if (!same(got, want)) extras.push(`CTRL ${want.ctrlIndex + 1} ${JSON.stringify(got ?? null)} vs ${JSON.stringify(want)}`);
  }
  for (const want of sent.expAssignments ?? []) {
    const got = actual.expAssignments?.find((exp) => exp.page === want.page && exp.item === want.item);
    if (!same(got, want)) {
      extras.push(`EXP page ${want.page} item ${want.item} ${JSON.stringify(got ?? null)} vs ${JSON.stringify(want)}`);
    }
  }
  return { identity, values, extras };
}

/** One line for the Patch Manager banner; the full lists go to the console. */
export function summarizeWriteFidelity(label: string, name: string, result: WriteFidelity): string {
  const part = (title: string, items: string[]) => (items.length === 0
    ? `${title}: all match`
    : `${title}: ${items.length} differ (${items.slice(0, 3).join('; ')}${items.length > 3 ? '; …' : ''})`);
  return `WRITE TEST ${label} "${name}". ${part('Name/blocks', result.identity)}. `
    + `${part('Knobs/volume', result.values)}. ${part('Extras', result.extras)}. Full list in the console`;
}

/** Does the slot already hold this patch, name and all? */
export function sameAsWritten(actual: GP200Preset, expected: GP200Preset): boolean {
  const { identity, values } = describeWriteFidelity(actual, expected);
  return identity.length === 0 && values.length === 0;
}

/** The same patch apart from its name — so a slot that already holds these
 *  settings can be copied on the pedal (seconds) instead of written from app
 *  data (10-20 s), which is how bank 64's identical slots are filled. */
export function sameSettings(actual: GP200Preset, expected: GP200Preset): boolean {
  return sameAsWritten(actual, { ...expected, patchName: actual.patchName });
}
