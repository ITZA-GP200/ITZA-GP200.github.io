import { useEffect, useRef, useState } from 'react';
import {
  LABEL_LUM_DEFAULT,
  LABEL_LUM_MAX,
  LABEL_LUM_MIN,
  SKIN_PALETTE,
  type BlockSkin,
  type ControlStyle,
} from '@/core/boardSkin';
import { BarsIcon, DialIcon } from './StyleIcons';

interface PedalSkinToolsProps {
  /** Shown in the control's labels, e.g. "DLY key colour". */
  moduleName: string;
  skin: BlockSkin;
  /** What this block renders with right now (its own style, or the board's). */
  style: ControlStyle;
  /** The colour the card is drawn in, for the swatch and the lit icons. */
  keyColor: string;
  onChange: (change: BlockSkin) => void;
  /** Board-wide label grey, as a lightness percentage. */
  labelLum?: number;
  onLabelLumChange?: (lum: number) => void;
}

const Locked = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const Unlocked = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" />
  </svg>
);

/**
 * The three per-block controls in a skinned pedal's header: key colour,
 * control style, and lock.
 *
 * Lock covers the style and the values only. Position and the on/off switch
 * stay live, because a locked block is still part of a chain you reorder and
 * still something you stomp on.
 */
export function PedalSkinTools({
  moduleName,
  skin,
  style,
  keyColor,
  onChange,
  labelLum = LABEL_LUM_DEFAULT,
  onLabelLumChange,
}: PedalSkinToolsProps) {
  const [picking, setPicking] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const locked = skin.locked === true;

  // Close the palette on an outside click or Escape, like any other popover.
  useEffect(() => {
    if (!picking) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setPicking(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPicking(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [picking]);

  return (
    <span
      className="pk-tools"
      ref={wrap}
      /* The board's pedal is a `draggable` <article>, so pressing and moving
         anywhere inside it starts a reorder drag — including on the slider,
         whose whole gesture is press and move. Cancelling dragstart here lets
         these controls keep the pointer; the card still drags by any of the
         surface around them. */
      draggable={false}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        className="pk-swatch"
        style={{ color: keyColor }}
        aria-label={`${moduleName} key colour`}
        aria-expanded={picking}
        onClick={() => setPicking((open) => !open)}
      />
      {picking && (
        <span className="pk-palette" role="group" aria-label={`${moduleName} key colour`}>
          {SKIN_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              className={`pk-chip${skin.color === color ? ' picked' : ''}`}
              style={{ background: color }}
              /* The lock freezes this block's colour — but not the board-wide
                 brightness below, which is why the popover still opens. */
              disabled={locked}
              aria-label={color}
              aria-pressed={skin.color === color}
              onClick={() => {
                onChange({ color });
                setPicking(false);
              }}
            />
          ))}
          {/* Every grey on a card — labels, chips, chain numbers, tool icons —
              is one colour at this lightness, so one control sets them all.
              It is the whole board's grey, not this block's: the popover is
              simply where the appearance controls already are. A native range
              is deliberate — it drags, it takes arrow keys, and it works under
              a thumb on the phone card without a line of pointer handling. */}
          {onLabelLumChange && (
            <label className="pk-lum">
              <span className="pk-lum-label">LABEL BRIGHTNESS · ALL PEDALS</span>
              <input
                type="range"
                min={LABEL_LUM_MIN}
                max={LABEL_LUM_MAX}
                step={1}
                value={labelLum}
                style={{ accentColor: keyColor }}
                onChange={(e) => onLabelLumChange(Number(e.currentTarget.value))}
              />
            </label>
          )}
        </span>
      )}
      <button
        type="button"
        className="pk-tool"
        style={{ color: locked ? undefined : keyColor }}
        disabled={locked}
        aria-label={`${moduleName} controls: switch to ${style === 'dial' ? 'bars' : 'dials'}`}
        onClick={() => onChange({ style: style === 'dial' ? 'bar' : 'dial' })}
      >
        {/* The icon is the destination, not the current state: showing bars
            while dials are on reads as "press for bars". */}
        {style === 'dial' ? <BarsIcon /> : <DialIcon />}
      </button>
      <button
        type="button"
        className={`pk-tool${locked ? ' on' : ''}`}
        style={locked ? { color: keyColor } : undefined}
        aria-label={`${moduleName} ${locked ? 'locked' : 'unlocked'}`}
        aria-pressed={locked}
        onClick={() => onChange({ locked: locked ? undefined : true })}
      >
        {locked ? <Locked /> : <Unlocked />}
      </button>
    </span>
  );
}
