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

export function describeWriteFidelity(actual: GP200Preset, sent: GP200Preset): WriteFidelity {
  const { identity, values } = describePatchDifferences(actual, sent);
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
  if (sent.expAssignments && !same(actual.expAssignments, sent.expAssignments)) extras.push('EXP assignments differ');
  if (sent.ctrlAssignments && !same(actual.ctrlAssignments, sent.ctrlAssignments)) extras.push('CTRL assignments differ');
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
