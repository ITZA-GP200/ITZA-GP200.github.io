import { useState, type CSSProperties } from 'react';
import type { EffectSlot } from '@/core/types';
import { getEffectName, getSlotModule } from '@/core/effectNames';
import { EFFECT_DESCRIPTIONS } from '@/core/effectDescriptions';
import { getBodySpec } from './boardPalette';
import { pedalIsWide } from './boardLayout';
import { type PedalArtEntry } from './pedalManifest';
import { ModuleGlyph } from './ModuleGlyph';
import { PedalControls } from './PedalControls';
import { PedalSkinTools } from './PedalSkinTools';
import { DEFAULT_KEY, type BlockSkin, type ControlStyle } from '@/core/boardSkin';

export interface PedalProps {
  slot: EffectSlot;
  /** array position in the chain (0-based) */
  index: number;
  art?: PedalArtEntry;
  onToggle: () => void;
  /** open the effect browser for this slot */
  onOpenPicker: () => void;
  onParamChange: (paramIdx: number, value: number) => void;
  onDragStart: (index: number) => void;
  /** keyboard reorder (grip button arrows) */
  onMove: (from: number, to: number) => void;
  /** hover/focus inspection for the info bar */
  onInspect: (inspecting: boolean) => void;
  /** ⓘ click: pin in the info bar */
  onPin: () => void;
  isPinned: boolean;
  /**
   * Show tap ‹ › reorder arrows. HTML5 drag-and-drop never fires on touch, and
   * the keyboard grip needs arrow keys, so without these a phone can't reorder
   * the chain at all.
   */
  showMoveButtons?: boolean;
  /** chain length, for the move bounds + the grip's announced position */
  chainLength: number;
  /* ── ITZA skin (fork) ──────────────────────────────────────────────────
     Absent on the stock board, so everything below is optional and the
     component behaves exactly as upstream's without it. */
  /** Draw as an ITZA card: header tools, key colour, dark field. */
  skinned?: boolean;
  /** This block's saved preferences (core/boardSkin.ts). */
  blockSkin?: BlockSkin;
  /** The style this block renders with, already resolved against the board. */
  controlStyle?: ControlStyle;
  onSkinChange?: (change: BlockSkin) => void;
  /** Board-wide label grey, as a lightness percentage. */
  labelLum?: number;
  onLabelLumChange?: (lum: number) => void;
}

/** One effect slot rendered as a physical pedal (docs/board-design-system.md). */
export function Pedal({
  slot,
  index,
  art,
  onToggle,
  onOpenPicker,
  onParamChange,
  onDragStart,
  onMove,
  onInspect,
  onPin,
  isPinned,
  showMoveButtons,
  chainLength,
  skinned = false,
  blockSkin = {},
  controlStyle = 'dial',
  onSkinChange,
  labelLum,
  onLabelLumChange,
}: PedalProps) {
  const [dragging, setDragging] = useState(false);

  const effectName = getEffectName(slot.effectId);
  // module identity comes from the physical block (slot 5 is ALWAYS the cab),
  // not the effectId; unmapped/zeroed ids must not relabel or recolor a slot
  const moduleName = getSlotModule(slot.slotIndex);
  // authentic per-effect colors from the artwork spec; module palette as fallback
  const spec = art?.colors ?? getBodySpec(moduleName);
  // the pedal keeps its natural size, but never wider than its fixed bay, so
  // swapping an effect only changes the padding inside the bay, never a
  // neighbour's position (see pedalIsWide)
  const wide = pedalIsWide(slot.slotIndex, slot.effectId);
  const caption = art?.basedOn ?? EFFECT_DESCRIPTIONS[effectName] ?? '';

  // amps get a control-panel strip (knobs live on the panel, like the hardware)
  const panel = art?.colors?.panel;
  const panelText = art?.colors?.panelText ?? spec.ink;
  let knobInk = spec.ink;
  if (panel) knobInk = panelText;
  // Graphic EQs get faders on the stock board: a graphic EQ should look like
  // one. The skin has no faders at all — every block is dials or bars, EQ
  // included, so the whole board reads as one instrument.
  const isEq = moduleName === 'EQ';
  const useFaders = !skinned && isEq;
  const useBars = skinned && controlStyle === 'bar';
  // A locked block's style and values are frozen; its position and its on/off
  // switch deliberately are not.
  const locked = skinned && blockSkin.locked === true;
  const keyColor = blockSkin.color ?? DEFAULT_KEY[moduleName] ?? spec.body;

  const bodyVars = {
    '--key': keyColor,
    '--body': spec.body,
    '--body-deep': spec.bodyDeep,
    '--ink': spec.ink,
    '--led': spec.led,
    ...(panel ? { '--panel': panel, '--panel-text': panelText } : {}),
  } as CSSProperties;

  const classes = ['pedal'];
  if (skinned) classes.push('pk');
  if (locked) classes.push('pk-locked');
  if (wide) classes.push('wide');
  if (dragging) classes.push('dragging');
  if (!slot.enabled) classes.push('bypassed');

  const footswitch = (
    <button
      type="button"
      className={wide ? 'stomp-round' : 'treadle'}
      aria-pressed={slot.enabled}
      aria-label={`Toggle ${effectName}`}
      onClick={onToggle}
    />
  );

  // data-flip-id: Flip matches captured state to live elements by identity unless
  // given an id. Without one it can't reconcile a pedal React has re-keyed or
  // remounted, and , animating with absolute:true , strands it at an absolute
  // position, out of flow: the board collapses and pedals overlap at stale
  // coordinates. slotIndex is the immutable block identity, so it survives
  // reordering.
  return (
    <article
      className={classes.join(' ')}
      style={bodyVars}
      data-chain={index}
      data-flip-id={`pedal-${slot.slotIndex}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        // Required: a dragstart that sets no data lets the browser abort the drag
        // outright, after this handler has already set dragIndex. Nothing then
        // fires dragend (the pedal unmounts on a cross-row move, so even the
        // bubbled reset can't reach it) and the board stays ghosted with every
        // cable hidden until reload.
        e.dataTransfer.setData('text/plain', String(index));
        setDragging(true);
        onDragStart(index);
      }}
      onDragEnd={() => setDragging(false)}
      onMouseEnter={() => onInspect(true)}
      onMouseLeave={() => onInspect(false)}
      onFocusCapture={() => onInspect(true)}
      onBlurCapture={() => onInspect(false)}
    >
      {/* knurled dot grip: signals the whole pedal is draggable */}
      <span className="pedal-grip" aria-hidden="true" />
      <span className="jack in" data-jack="in" />
      <span className="jack out" data-jack="out" />
      <span className="screw tl" /><span className="screw tr" />
      <span className="screw bl" /><span className="screw br" />
      <span className="module-chip">{moduleName}</span>
      {skinned && onSkinChange && (
        <PedalSkinTools
          moduleName={moduleName}
          skin={blockSkin}
          style={controlStyle}
          keyColor={keyColor}
          onChange={onSkinChange}
          labelLum={labelLum}
          onLabelLumChange={onLabelLumChange}
        />
      )}
      <button
        type="button"
        className={`info-chip${isPinned ? ' pinned' : ''}`}
        aria-label={`About ${effectName}`}
        aria-pressed={isPinned}
        onClick={onPin}
      >
        i
      </button>
      <span
        className="chain-num"
        role="button"
        tabIndex={0}
        aria-label={
          `Reorder ${effectName}, position ${index + 1} of ${chainLength}. Use arrow keys.`
        }
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' && index > 0) {
            e.preventDefault();
            onMove(index, index - 1);
          } else if (e.key === 'ArrowRight' && index < chainLength - 1) {
            e.preventDefault();
            onMove(index, index + 1);
          }
        }}
      >
        #{index + 1}
      </span>

      {/* knob/switch drags must never start a pedal drag */}
      <div
        className={`controls${panel ? ' amp-panel' : ''}`}
        draggable
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <PedalControls
          slot={slot}
          effectName={effectName}
          spec={spec}
          knobInk={knobInk}
          onParamChange={onParamChange}
          locked={locked}
          arc={skinned}
          bars={useBars}
          faders={useFaders}
        />
      </div>

      <span className={`p-led${slot.enabled ? ' on' : ''}`} />
      {/* visual-only: state is announced via the footswitch aria-pressed */}
      {!slot.enabled && <span className="p-off-tag" aria-hidden="true">BYPASSED</span>}

      <div className="p-name">
        <button
          type="button"
          className="p-name-btn"
          aria-label={`Change ${moduleName} effect: ${effectName}`}
          aria-haspopup="dialog"
          onClick={onOpenPicker}
        >
          <ModuleGlyph module={moduleName} className="p-name-icon" />
          <span className="p-name-text">{effectName}</span>
        </button>
      </div>
      <p className="p-desc" title={caption}>
        {caption}
      </p>

      {wide ? <div className="fs-row">{footswitch}</div> : footswitch}

      {/* Touch-only chain reorder. Absolutely positioned over the brand strip so
          enabling them doesn't change the pedal's height (and with it the bay). */}
      {showMoveButtons && (
        <>
          <button
            type="button"
            className="pedal-move prev"
            disabled={index === 0}
            aria-label={`Move ${effectName} earlier in the chain`}
            onClick={() => onMove(index, index - 1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="pedal-move next"
            disabled={index === chainLength - 1}
            aria-label={`Move ${effectName} later in the chain`}
            onClick={() => onMove(index, index + 1)}
          >
            ›
          </button>
        </>
      )}
      <div className="brand-strip">GP200 Studio</div>
    </article>
  );
}
