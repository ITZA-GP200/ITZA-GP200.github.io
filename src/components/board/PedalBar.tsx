import { useRef, useState } from 'react';
import type { KnobParam } from '@/core/effectParams';
import { clampSnap, formatValue, stepValue } from './paramValue';

interface PedalBarProps {
  param: KnobParam;
  value: number;
  onChange: (value: number) => void;
  /** for the accessible label, e.g. "Guitar EQ 1 125Hz" */
  pedalName: string;
}

/** pixels of vertical drag for a full min→max sweep, as the dials use */
const DRAG_RANGE_PX = 160;

/**
 * The ITZA skin's bar: the track is the parameter's whole range and the lit
 * part is where the value sits in it, with the name and the reading above.
 *
 * It is a readout you can grab, not a slider — there is no cap to aim at, and
 * the gesture is the same vertical drag the dials use, so switching the board
 * between dials and bars never changes how a control feels. Interaction
 * contract matches PedalKnob and PedalFader: drag, double-click to reset,
 * arrow keys, Shift for fine, role="slider".
 */
export function PedalBar({ param, value, onChange, pedalName }: PedalBarProps) {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ y: 0, value: 0 });

  const range = param.max - param.min;
  const pct = range > 0 ? (value - param.min) / range : 0;

  return (
    <div
      className={`pbar${dragging ? ' dragging' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={`${pedalName} ${param.name}`}
      aria-valuemin={param.min}
      aria-valuemax={param.max}
      aria-valuenow={Number(value.toFixed(param.step < 1 ? 1 : 0))}
      aria-valuetext={formatValue(value, param)}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragStart.current = { y: e.clientY, value };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const raw = dragStart.current.value + ((dragStart.current.y - e.clientY) * range) / DRAG_RANGE_PX;
        const next = clampSnap(raw, param);
        if (next !== value) onChange(next);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onDoubleClick={() => onChange(param.default)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
          e.preventDefault();
          onChange(stepValue(value, param, 1, { fine: e.shiftKey }));
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault();
          onChange(stepValue(value, param, -1, { fine: e.shiftKey }));
        }
      }}
    >
      <span className="pb-head">
        <span className="pb-name" title={param.name}>{param.name}</span>
        <span className="pb-value">{formatValue(value, param)}</span>
      </span>
      <span className="pb-track">
        <span className="pb-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
      </span>
    </div>
  );
}
