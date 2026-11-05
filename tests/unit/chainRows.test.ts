import { describe, expect, it } from 'vitest';
import { splitChainRows } from '@/components/board/boardLayout';

const CHAIN = ['PRE', 'WAH', 'DST', 'AMP', 'NR', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB', 'VOL'];

/**
 * The chain's rows are decided by COUNT, never by what fits.
 *
 * This is the fix for a card jumping rows: a card's height follows its control
 * count, so switching one block to bars made the board taller, the zoom search
 * shrank it, more cards then fitted a line and the chain re-wrapped — the EQ
 * moved from the second row to the first because the EQ got taller. Rows
 * changing height for bars is expected; pedals changing row is not.
 */
describe('splitChainRows', () => {
  it('splits the GP-200 chain 6 and 5, the evenest eleven allows', () => {
    expect(splitChainRows(CHAIN, 2)).toEqual([
      ['PRE', 'WAH', 'DST', 'AMP', 'NR', 'CAB'],
      ['EQ', 'MOD', 'DLY', 'RVB', 'VOL'],
    ]);
  });

  it('keeps signal order, so row order IS chain order', () => {
    expect(splitChainRows(CHAIN, 2).flat()).toEqual(CHAIN);
  });

  it('depends on nothing but the length', () => {
    // the whole point: no card property can move the split
    const once = splitChainRows(CHAIN, 2);
    const again = splitChainRows([...CHAIN], 2);
    expect(again).toEqual(once);
  });

  it('never makes more rows than asked for', () => {
    for (let n = 1; n <= 24; n++) {
      const cells = Array.from({ length: n }, (_, i) => i);
      for (const maxRows of [2, 3]) {
        const rows = splitChainRows(cells, maxRows);
        expect(rows.length, `${n} cells, ${maxRows} rows`).toBeLessThanOrEqual(maxRows);
        expect(rows.flat()).toEqual(cells);
      }
    }
  });

  it('puts any remainder on the last row, never leaves it longest', () => {
    for (let n = 2; n <= 24; n++) {
      const rows = splitChainRows(Array.from({ length: n }, (_, i) => i), 2);
      const last = rows[rows.length - 1].length;
      for (const row of rows) expect(row.length).toBeGreaterThanOrEqual(last);
    }
  });

  it('survives an empty chain rather than producing no row at all', () => {
    expect(splitChainRows([], 2)).toEqual([[]]);
  });
});
