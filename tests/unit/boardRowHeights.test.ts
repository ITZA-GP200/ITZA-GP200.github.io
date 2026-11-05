import { afterEach, describe, expect, it } from 'vitest';
import { equalizeRows } from '@/components/board/useBoardFit';

/**
 * One height for every line the chain wraps onto.
 *
 * A card's height follows its control count, so two rows of a card board end
 * up different heights for no reason the user can see. equalizeRows measures
 * the tallest bay and publishes it as a per-bay minimum, which equalises the
 * lines *however they break* — that is what makes it survive the zoom search
 * re-wrapping the chain underneath it.
 *
 * jsdom reports every rect as zero, so each bay is given its own height here.
 * That is the whole input the function has.
 */
function board(heights: number[]): HTMLElement {
  const rows = document.createElement('div');
  rows.className = 'board-rows';
  for (const height of heights) {
    const bay = document.createElement('div');
    bay.className = 'pedal-bay';
    bay.getBoundingClientRect = () => ({ height }) as DOMRect;
    rows.append(bay);
  }
  document.body.append(rows);
  return rows;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('equalizeRows', () => {
  it('publishes the tallest card as the minimum for every bay', () => {
    const rows = board([305, 442, 305, 388]);
    equalizeRows(rows);
    // the tallest, plus the sub-pixel cushion the fractional zoom needs
    expect(rows.style.getPropertyValue('--pk-bay-h')).toBe('444px');
  });

  it('rounds up, so a fractional rect can never leave a short row', () => {
    const rows = board([305, 441.2]);
    equalizeRows(rows);
    expect(rows.style.getPropertyValue('--pk-bay-h')).toBe('444px');
  });

  it('re-measures from the natural height, so a shorter board shrinks back', () => {
    const rows = board([305, 442]);
    equalizeRows(rows);
    expect(rows.style.getPropertyValue('--pk-bay-h')).toBe('444px');
    // the tall effect is swapped out for a short one
    const bays = rows.querySelectorAll('.pedal-bay');
    bays[1].getBoundingClientRect = () => ({ height: 310 }) as DOMRect;
    equalizeRows(rows);
    expect(rows.style.getPropertyValue('--pk-bay-h')).toBe('312px');
  });

  it('is idempotent: a second pass over the same board changes nothing', () => {
    const rows = board([305, 442]);
    equalizeRows(rows);
    const once = rows.getAttribute('style');
    equalizeRows(rows);
    expect(rows.getAttribute('style')).toBe(once);
  });

  it('sets nothing at all when there is nothing to measure', () => {
    // the prerender, and any pass before layout: every rect is zero. Setting
    // 0px would be harmless but a missing property is what the CSS fallback
    // is written for.
    const rows = board([]);
    equalizeRows(rows);
    expect(rows.style.getPropertyValue('--pk-bay-h')).toBe('');

    const unlaid = board([0, 0]);
    equalizeRows(unlaid);
    expect(unlaid.style.getPropertyValue('--pk-bay-h')).toBe('');
  });
});
