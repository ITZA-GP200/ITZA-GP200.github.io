import { useEffect, useRef, useState } from 'react';
import { SKIN_PALETTE, type BlockSkin, type ControlStyle } from '@/core/boardSkin';

interface PedalSkinToolsProps {
  /** Shown in the control's labels, e.g. "DLY key colour". */
  moduleName: string;
  skin: BlockSkin;
  /** What this block renders with right now (its own style, or the board's). */
  style: ControlStyle;
  /** The colour the card is drawn in, for the swatch and the lit icons. */
  keyColor: string;
  onChange: (change: BlockSkin) => void;
}

const Dial = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /><path d="M12 5v3" />
  </svg>
);
const Bars = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M4 19V10" /><path d="M10 19V5" /><path d="M16 19v-6" /><path d="M22 19V8" />
  </svg>
);
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
export function PedalSkinTools({ moduleName, skin, style, keyColor, onChange }: PedalSkinToolsProps) {
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
    <span className="pk-tools" ref={wrap}>
      <button
        type="button"
        className="pk-swatch"
        style={{ color: keyColor }}
        disabled={locked}
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
              aria-label={color}
              aria-pressed={skin.color === color}
              onClick={() => {
                onChange({ color });
                setPicking(false);
              }}
            />
          ))}
        </span>
      )}
      <button
        type="button"
        className="pk-tool"
        style={{ color: locked ? undefined : keyColor }}
        disabled={locked}
        aria-label={`${moduleName} controls: ${style === 'dial' ? 'dials' : 'bars'}`}
        onClick={() => onChange({ style: style === 'dial' ? 'bar' : 'dial' })}
      >
        {style === 'dial' ? <Dial /> : <Bars />}
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
