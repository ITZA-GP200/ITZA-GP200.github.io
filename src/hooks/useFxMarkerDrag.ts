import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** How close to a scroll container edge before the list follows the finger. */
const EDGE_PX = 72;
const EDGE_SCROLL_PX = 10;

export type FxMarkerKind = 'send' | 'return';

export interface FxMarkerDragState {
  /** which marker is in the air, or null */
  kind: FxMarkerKind | null;
  /** the chain position (1..itemCount) it would land on right now */
  target: number | null;
  /** how far the marker has been dragged, for the lift */
  offsetY: number;
  /** wire to the marker grip's onPointerDown */
  start: (kind: FxMarkerKind, e: React.PointerEvent) => void;
}

/**
 * Drag an FX loop marker to a new place in the chain.
 *
 * Deliberately NOT useDragReorder. That hook reorders an eleven-item list:
 * its targets are slots, it animates the other rows past the one you picked
 * up, and it commits a from/to pair. A marker does none of that — it inserts
 * at a boundary, nothing else moves, and the answer is a single position. The
 * two gestures look alike and share almost nothing underneath, so sharing an
 * implementation would mean one of them carrying the other's machinery.
 *
 * Positions are 1..itemCount, where N means "after the Nth block" — the same
 * numbering fxLoopSend and fxLoopReturn already use, so the caller can hand
 * the result straight to onFxSendChange without translating anything.
 */
export function useFxMarkerDrag({
  scrollRef,
  listRef,
  itemCount,
  onCommit,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  listRef: RefObject<HTMLElement | null>;
  itemCount: number;
  onCommit: (kind: FxMarkerKind, position: number) => void;
}): FxMarkerDragState {
  const [kind, setKind] = useState<FxMarkerKind | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [offsetY, setOffsetY] = useState(0);

  /** Card rects, measured once at pickup: nothing moves during this drag, so
   *  one measurement stays true for the whole gesture. */
  const rows = useRef<{ top: number; bottom: number }[]>([]);
  const startY = useRef(0);
  const live = useRef<FxMarkerKind | null>(null);

  /** Which boundary the finger is over, clamped to the ends of the chain. */
  const positionAt = useCallback((clientY: number): number => {
    const measured = rows.current;
    if (measured.length === 0) return 1;
    for (let i = 0; i < measured.length; i += 1) {
      if (clientY < measured[i].bottom) return i + 1;
    }
    return measured.length;
  }, []);

  const start = useCallback((next: FxMarkerKind, e: React.PointerEvent) => {
    const list = listRef.current;
    if (!list) return;
    rows.current = [...list.querySelectorAll('[data-drag-row]')].map((el) => {
      const rect = el.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    startY.current = e.clientY;
    live.current = next;
    setKind(next);
    setTarget(positionAt(e.clientY));
    setOffsetY(0);
    // The grip takes the gesture outright (touch-action: none in CSS), so the
    // list cannot start scrolling under a drag that has already begun.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [listRef, positionAt]);

  useEffect(() => {
    if (kind === null) return;

    const move = (e: PointerEvent) => {
      setOffsetY(e.clientY - startY.current);
      setTarget(positionAt(e.clientY));
      // Follow the finger past the edge, as the row drag does: the chain is
      // taller than the screen, so the far end is unreachable otherwise.
      const scroller = scrollRef.current;
      if (!scroller) return;
      const box = scroller.getBoundingClientRect();
      if (e.clientY < box.top + EDGE_PX) scroller.scrollTop -= EDGE_SCROLL_PX;
      else if (e.clientY > box.bottom - EDGE_PX) scroller.scrollTop += EDGE_SCROLL_PX;
    };

    const end = (e: PointerEvent) => {
      const landed = positionAt(e.clientY);
      const dragged = live.current;
      live.current = null;
      setKind(null);
      setTarget(null);
      setOffsetY(0);
      if (dragged) onCommit(dragged, Math.max(1, Math.min(itemCount, landed)));
    };

    const cancel = () => {
      live.current = null;
      setKind(null);
      setTarget(null);
      setOffsetY(0);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [kind, itemCount, onCommit, positionAt, scrollRef]);

  return { kind, target, offsetY, start };
}
