import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Control labels read in CAPS; readings do not.
 *
 * The distinction is the whole decision: a param *name* is a word and reads
 * faster shouting, which is the point on a board glanced at from standing
 * height. A *reading* carries its unit in the case the unit is written in —
 * "125Hz", "500ms", "1/8." — and uppercasing those gives "125HZ" and "500MS",
 * which read as typos.
 *
 * Asserted against the stylesheet because that is where the rule lives: the
 * case is drawn by CSS so the source and the accessibility tree keep the
 * readable text (`text-transform` does not change an element's text content).
 */
const css = readFileSync(
  join(process.cwd(), 'src/components/board/skin-itza.css'),
  'utf8',
);

/**
 * The whole rule a selector belongs to — its full selector list and its
 * declarations, as written. Taken back to the end of the previous rule or
 * comment, because the point of these assertions is that the three label
 * surfaces share ONE rule and so cannot drift apart.
 */
function ruleFor(selector: string): string {
  const at = css.indexOf(selector);
  expect(at, `${selector} is not in the skin`).toBeGreaterThan(-1);
  const before = Math.max(css.lastIndexOf('}', at), css.lastIndexOf('*/', at));
  const open = css.indexOf('{', at);
  return css.slice(before + 1, css.indexOf('}', open));
}

describe('control labels in caps', () => {
  const rule = ruleFor('.pbar .pb-name');

  it('uppercases the param names on the board, the phone and the bars', () => {
    expect(rule).toContain('text-transform: uppercase');
    // one rule covers all three, so the three surfaces cannot drift apart
    expect(rule).toContain(".board-view[data-skin='itza'] .pedal.pk .k-label");
    expect(rule).toContain('.mobile-view .m-pedal-card.m-pk .k-label');
  });

  it('adds no tracking, because the labels are set in a monospace', () => {
    // Uppercase usually wants some. JetBrains Mono does not: every glyph is
    // already on the same advance. Tracking here bought nothing and pushed
    // THRESHOLD — which already fills its 64px column — a further 5px past it.
    expect(rule).not.toContain('letter-spacing');
  });

  it('gives the label column the same room at every size', () => {
    // Text width scales with the font, so the column has to scale with it too
    // or a label spills further over its neighbour with every notch. The
    // floor pins an un-set board at the width it shipped with.
    expect(css).toContain('width: calc(64px * max(1, var(--pk-label-k, 1)))');
    expect(css).toContain('max-width: calc(64px * max(1, var(--pk-label-k, 1)))');
    expect(css).toContain('width: calc(72px * max(1, var(--pk-label-k, 1)))');
    expect(css).toContain('max-width: calc(72px * max(1, var(--pk-label-k, 1)))');
  });

  it('exempts the names that are themselves unit readings', () => {
    // the components add `as-written` (paramValue's labelClass), because
    // "starts with a digit" is not something a selector can ask
    const exemption = ruleFor('.pbar .pb-name.as-written');
    expect(exemption).toContain('text-transform: none');
    expect(exemption).toContain(".pedal.pk .k-label.as-written");
    expect(exemption).toContain('.m-pedal-card.m-pk .k-label.as-written');
    // and it has to come after the rule it overrides, or it never wins
    expect(css.indexOf('.pb-name.as-written')).toBeGreaterThan(
      css.indexOf('text-transform: uppercase'),
    );
  });

  it('leaves the readings alone', () => {
    // .k-value is the figure under a fader, .pb-value the one on a bar's head
    expect(rule).not.toContain('k-value');
    expect(rule).not.toContain('pb-value');
    // and the card's own name is a name the user typed, not a label
    expect(rule).not.toContain('p-name');
  });
});

describe('label size', () => {
  it('multiplies the skin\'s own sizes rather than restating them', () => {
    // one unitless property, so the relative sizes between a knob label and a
    // bar's head stay as drawn
    expect(css).toContain('--pk-label-k: calc(var(--pk-label-size, 100) / 100)');
    for (const size of ['13px', '14px', '15px']) {
      expect(css).toContain(`calc(${size} * var(--pk-label-k, 1))`);
    }
  });

  it('falls back to the size the skin shipped with', () => {
    // every use carries the fallback, so a board with no setting published
    // (the prerender, upstream's shell) is untouched
    const uses = css.match(/var\(--pk-label-k[^)]*\)/g) ?? [];
    expect(uses.length).toBeGreaterThan(3);
    for (const use of uses) expect(use).toBe('var(--pk-label-k, 1)');
  });
});
