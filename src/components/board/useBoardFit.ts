import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * How far the board is allowed to shrink. Below this the pedals stop being
 * comfortably readable/turnable, so the stage goes back to scrolling instead —
 * shrinking is a fit-more-on-screen affordance, not a zoom-to-fit-anything one.
 */
const MIN_ZOOM = 0.68;

/** Ignore shrinks smaller than half a percent: not worth a repaint. */
const NO_OP_ZOOM = 0.995;

/** Binary-search steps between MIN_ZOOM and 1 — 5 lands inside ~0.01. */
const STEPS = 5;

/**
 * Shrink the pedal row just enough to keep the whole board on screen.
 *
 * The board is built from fixed-size enclosures (172/310px bays, 44px knobs,
 * 9px labels), so a narrow window pushes the chain onto extra wrapped lines and
 * the back of it disappears under the floating deck. Rather than reflowing the
 * pedals themselves — which would restack knobs and make them *taller* on the
 * very screens that are short — the row scales down uniformly.
 *
 * `zoom` (not `transform: scale`) is what does it: zoom scales layout, so the
 * chain re-wraps onto fewer lines as it shrinks and the deck below moves up.
 * Two consumers of the board's geometry survive it:
 * - CableLayer measures jacks in client px and feeds them to a viewBox built
 *   from the same client-space box, so the two cancel and the cables land.
 * - GSAP's Flip derives its matrices by probing live sibling elements
 *   (utils/matrix.js), which measures the effective zoom rather than assuming
 *   1 — but anything that copies a client rect into an inline px style has to
 *   divide it out itself (see useFlipReorder's lockRowHeights).
 *
 * Because the row wraps, height is not a simple ratio: halving the scale can
 * drop two lines at once, and where the lines break is a layout outcome. So the
 * fit is a binary search over *measured* heights rather than arithmetic on one
 * measurement — laid-out height is monotonic in the scale, which is all a
 * binary search needs.
 *
/**
 * The custom property the skin's bays read for their minimum height. Set on
 * `.board-rows` so one value covers every bay on every line.
 */
const BAY_HEIGHT_VAR = '--pk-bay-h';

/** Slack added to the measured height, to absorb sub-pixel rounding. */
const SUBPIXEL_CUSHION_PX = 2;

/**
 * Give every bay the height of the tallest card on the board, so the lines the
 * chain wraps onto are all one height.
 *
 * Why a measurement and not a reserved number: a card's height follows how
 * many control rows it has, and that is not knowable in CSS — a block set to
 * bars stacks one per row, a six-knob card in a wide bay takes two, and the
 * Label Size slider can add a wrapped line to every label at once. The old
 * per-module reservation (bayMinHeight) is exactly what this replaces, and it
 * is what left ~140px of dead air above short pedals.
 *
 * A per-bay minimum is what makes it hold: it equalises the lines *however
 * they break*, so it does not care how many lines the chain is on, or that the
 * zoom search below keeps changing where they break. Reset-then-measure makes
 * it idempotent — each pass reads the natural height rather than the one it
 * just imposed, so a shorter effect shrinks the board back instead of being
 * pinned tall.
 *
 * Bays already stretch to their own line's height (.board-row align-items) and
 * the card fills its bay (.pedal.pk height:100%), so the tallest bay IS the
 * tallest card, and the slack inside each card goes to its control area.
 *
 * It has to be told the zoom, and it has to run at the zoom the board ends up
 * at. A card's height is NOT a fixed number of CSS pixels across zooms:
 * `zoom` scales layout, the scaled type is rounded to device pixels, and a
 * label that took one line at 13px can take two at 10.8px. Measuring once at
 * 1 and applying the result at 0.83 came out 9px short for exactly that
 * reason — so the fit's `apply` calls this at every candidate scale instead.
 *
 * @param zoom the scale `rows` is currently drawn at, divided back out of the
 *             client rects so the property is written in CSS pixels
 */
export function equalizeRows(rows: HTMLElement, zoom = 1) {
  rows.style.removeProperty(BAY_HEIGHT_VAR);
  const bays = rows.querySelectorAll<HTMLElement>('.pedal-bay');
  let tallest = 0;
  bays.forEach((bay) => {
    tallest = Math.max(tallest, bay.getBoundingClientRect().height / zoom);
  });
  if (tallest <= 0) return;
  rows.style.setProperty(BAY_HEIGHT_VAR, `${Math.ceil(tallest) + SUBPIXEL_CUSHION_PX}px`);
}

/**
 * @param rowsRef  the `.board-rows` element (also useFlipReorder's scope)
 * @param orderKey re-fit when the chain changes: swapping an effect changes a
 *                 pedal's height, and reordering changes where lines break
 * @param enabled  off for the single-row (phone/small-tablet) board, which is
 *                 meant to be swiped through at full size
 * @param equalize one height for every wrapped line (the ITZA skin's card
 *                 board). Off for upstream's enclosures, which are meant to be
 *                 their own sizes.
 * @param layoutKey anything else that changes a card's height without changing
 *                 the chain — today, the Label Size setting.
 *
 *                 It cannot be left to the ResizeObserver, and this is the one
 *                 case where that is true: equalising pins a MINIMUM height on
 *                 every bay, so when the labels get smaller the cards shrink
 *                 inside bays that do not, the observed box never changes, and
 *                 nothing re-fits. The board would stay stuck at the size it
 *                 grew to and dragging the slider back down would not release
 *                 it. Re-running the effect does: the cleanup drops both the
 *                 zoom and the minimum, and the fresh fit measures from
 *                 nothing.
 */
export function useBoardFit(
  rowsRef: RefObject<HTMLDivElement | null>,
  orderKey: string,
  enabled: boolean,
  equalize = false,
  layoutKey = '',
) {
  const stageRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const rows = rowsRef.current;
    const stage = stageRef.current;
    if (!rows || !stage) return;
    if (!enabled) {
      rows.style.removeProperty('zoom');
      rows.style.removeProperty(BAY_HEIGHT_VAR);
      return;
    }

    let frame = 0;

    // Set the scale, equalise the lines AT that scale, and report the height
    // the board then occupies. The two have to move together: the budget below
    // is spent on the equalised board, and the equalisation is only correct at
    // the scale it was measured at (see equalizeRows).
    const apply = (zoom: number) => {
      if (zoom >= 1) rows.style.removeProperty('zoom');
      else rows.style.zoom = String(zoom);
      if (equalize) equalizeRows(rows, zoom >= 1 ? 1 : zoom);
      return rows.getBoundingClientRect().height;
    };

    const fit = () => {
      frame = 0;
      // Measure the unscaled board first: everything else in the stage (its
      // padding, the chassis frame, the floating deck) keeps its size when the
      // row shrinks, so that chrome comes off the height budget once and stays
      // off it.
      const naturalHeight = apply(1);
      const available = stage.clientHeight - (stage.scrollHeight - naturalHeight);
      if (available <= 0 || naturalHeight <= available) return;

      // Largest scale whose *laid-out* height still fits.
      let low = MIN_ZOOM;
      let high = 1;
      for (let i = 0; i < STEPS; i++) {
        const mid = (low + high) / 2;
        if (apply(mid) <= available) low = mid;
        else high = mid;
      }

      // Quantise down: sub-pixel jitter would otherwise write a new zoom on
      // every observer tick, and rounding up puts the board back over the edge
      // it was just fitted inside.
      let next = Math.max(MIN_ZOOM, Math.floor(low * 100) / 100);
      if (next > NO_OP_ZOOM) next = 1;
      apply(next);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };

    fit();
    // The stage is the box being fitted into; the rows are what changes height
    // when an effect swap loads a taller pedal. Observing the rows can't loop:
    // every fit re-measures from scale 1 and lands on the same value.
    const observer = new ResizeObserver(schedule);
    observer.observe(stage);
    observer.observe(rows);
    window.addEventListener('resize', schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      rows.style.removeProperty('zoom');
      rows.style.removeProperty(BAY_HEIGHT_VAR);
    };
  }, [rowsRef, orderKey, enabled, equalize, layoutKey]);

  return { stageRef };
}
