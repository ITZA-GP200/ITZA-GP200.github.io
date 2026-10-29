import type { PointerEvent as ReactPointerEvent } from 'react';
import type { FxMarkerKind } from '@/hooks/useFxMarkerDrag';

interface FxMarkerProps {
  kind: FxMarkerKind;
  /** "↗ FX SEND" */
  label: string;
  /** the loop's own colour for this marker */
  color: string;
  /** false offline or wherever the position cannot be changed */
  draggable: boolean;
  dragging: boolean;
  /** how far it has been dragged, so it tracks the finger */
  offsetY: number;
  onGripDown: (e: ReactPointerEvent) => void;
  /** opens the FX loop panel, the keyboard and precision path */
  onEdit: () => void;
}

/**
 * One end of the FX loop, in the chain.
 *
 * Two handles and no modes, the same shape the cards use: the grip on the
 * left moves it, EDIT on the right opens the panel. Dragging is pointer-only
 * — there is no touch equivalent of a keyboard — so EDIT is not a leftover
 * from before the drag existed, it is the way anyone not using a pointer
 * changes the same thing.
 */
export function FxMarker({
  kind,
  label,
  color,
  draggable,
  dragging,
  offsetY,
  onGripDown,
  onEdit,
}: FxMarkerProps) {
  return (
    <div
      className={`m-marker fx${dragging ? ' dragging' : ''}`}
      style={{
        '--fx-marker': color,
        // Tracks the finger without leaving the flow: the gap it belongs to
        // has to stay where it is, or the geometry measured at pickup stops
        // describing the list underneath.
        transform: dragging ? `translateY(${offsetY}px)` : undefined,
      } as React.CSSProperties}
    >
      {draggable && (
        <button
          type="button"
          className="m-marker-grip"
          aria-label={`Move the FX loop ${kind} to another place in the chain`}
          onPointerDown={onGripDown}
        >
          <span className="m-grip-dots" aria-hidden="true" />
        </button>
      )}
      <span className="m-marker-label">{label}</span>
      <button type="button" className="m-marker-edit" onClick={onEdit}>
        EDIT
      </button>
    </div>
  );
}
