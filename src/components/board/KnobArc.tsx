import { SWEEP } from './knobGeometry';

const ARC_R = 36;
const CIRCUMFERENCE = 2 * Math.PI * ARC_R;
const ARC_LEN = CIRCUMFERENCE * (SWEEP / 360);

/** Where a value sits in its own range, 0..1. Clamped: a param that reports
 *  out of range must not draw a dash longer than the track. */
const pctOf = (value: number, param: { min: number; max: number }) =>
  (param.max === param.min
    ? 0
    : Math.min(1, Math.max(0, (value - param.min) / (param.max - param.min))));

interface KnobArcProps {
  value: number;
  param: { min: number; max: number };
  /** the formatted reading, drawn inside the ring */
  readout: string;
}

/**
 * The ITZA skin's gauge: 270° of track, the same arc filled to the value, and
 * the reading in the middle.
 *
 * Lives on its own because two different knobs draw it — the board's
 * PedalKnob and the phone's MobileKnob, which share no code otherwise
 * (one drags vertically with touch-action:none, the other horizontally under
 * pan-y). The face has to be identical in both; the gesture does not.
 *
 * `currentColor` fills it, so the block's key colour reaches the arc without
 * either knob knowing anything about the skin.
 */
export function KnobArc({ value, param, readout }: KnobArcProps) {
  return (
    <>
      {/* The dash length is the sweep's share of the circumference, so this
          stays tied to SWEEP rather than to a hand-tuned number. */}
      <circle
        cx={50} cy={50} r={ARC_R} fill="none"
        stroke="rgba(255,255,255,.12)" strokeWidth={7} strokeLinecap="round"
        strokeDasharray={`${ARC_LEN.toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
        transform="rotate(135 50 50)"
      />
      <circle
        cx={50} cy={50} r={ARC_R} fill="none"
        stroke="currentColor" strokeWidth={7} strokeLinecap="round"
        strokeDasharray={`${(ARC_LEN * pctOf(value, param)).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
        transform="rotate(135 50 50)"
      />
      {/* Long readings have to fit inside the arc: a cab's high cut is
          "20001", a synced delay "1/8.". Step the size down by length rather
          than letting it spill over the ring. */}
      <text
        x={50}
        y={57}
        textAnchor="middle"
        fill="#f0f0f3"
        fontWeight={500}
        fontSize={readout.length > 5 ? 15 : readout.length > 4 ? 18 : readout.length > 3 ? 21 : 25}
      >
        {readout}
      </text>
    </>
  );
}
