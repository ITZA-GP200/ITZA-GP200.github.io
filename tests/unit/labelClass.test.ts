import { describe, expect, it } from 'vitest';
import { isUnitName, labelClass } from '@/components/board/paramValue';
import { getEffectParams } from '@/core/effectParams';
import { getEffectsByModule } from '@/core/effectNames';

/**
 * Control labels are set in caps, except the ones that are not words.
 *
 * The EQ bands are NAMED "125Hz", "1.6kHz", "4kHz". Uppercasing a name is a
 * readability win; uppercasing a unit is not — "1.6KHZ" reads as a typo. A
 * leading digit is the whole test, and this checks that it actually separates
 * the two across every effect the GP-200 has, rather than just the ones that
 * happen to be on screen.
 */
describe('isUnitName', () => {
  it('marks a frequency, and leaves a word alone', () => {
    for (const unit of ['125Hz', '400Hz', '1.6kHz', '4kHz', '100Hz', '6kHz']) {
      expect(isUnitName(unit), unit).toBe(true);
    }
    for (const word of ['Threshold', 'Gain', 'Mix', 'Pre Delay', 'Low Cut', '']) {
      expect(isUnitName(word), word).toBe(false);
    }
  });

  it('separates the two cleanly across every effect in the catalogue', () => {
    const flagged = new Set<string>();
    const plain = new Set<string>();
    for (const module of ['PRE', 'WAH', 'DST', 'AMP', 'NR', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB', 'VOL']) {
      for (const effect of getEffectsByModule(module)) {
        for (const param of getEffectParams(effect.effectId)) {
          (isUnitName(param.name) ? flagged : plain).add(param.name);
        }
      }
    }
    // everything exempted really does carry a unit…
    for (const name of flagged) expect(name, name).toMatch(/^[\d.]+\s?(k?Hz|ms|s|dB)/i);
    // …and nothing left in caps secretly starts with a digit
    for (const name of plain) expect(name[0] ?? 'x', name).not.toMatch(/\d/);
    expect(flagged.size).toBeGreaterThan(0);
  });
});

describe('labelClass', () => {
  it('is the plain class for a word', () => {
    expect(labelClass('Threshold')).toBe('k-label');
    expect(labelClass('Threshold', 'pb-name')).toBe('pb-name');
  });

  it('adds the exemption for a unit, on whichever control draws it', () => {
    expect(labelClass('1.6kHz')).toBe('k-label as-written');
    expect(labelClass('1.6kHz', 'pb-name')).toBe('pb-name as-written');
  });
});
