import { useState, useRef, type RefObject } from 'react';
import type { GP200Preset } from '@/core/types';
import type { ManifestIndex } from '@/components/board/pedalManifest';
import { lookupPedalArt } from '@/components/board/pedalManifest';
import { displayPosition, useDragReorder } from '@/hooks/useDragReorder';
import { useFxMarkerDrag, type FxMarkerKind } from '@/hooks/useFxMarkerDrag';
import { FxMarker } from './FxMarker';
import { FX_RETURN_COLOR, FX_SEND_COLOR } from '@/core/boardSkin';
import { ChainRow } from './ChainRow';
import { ChainCable } from './ChainCable';
import { blockSkin, styleFor, type BlockSkin, type BoardSkin, type ControlStyle } from '@/core/boardSkin';

interface ChainScreenProps {
  preset: GP200Preset;
  artIndex: ManifestIndex | null;
  /** the scrolling <main>, so a drag near the edge can follow the finger */
  scrollRef: RefObject<HTMLElement | null>;
  onToggle: (slotIndex: number, currentlyEnabled: boolean) => void;
  onMove: (from: number, to: number) => void;
  onOpenFxLoop: () => void;
  /* ── ITZA skin (fork) ────────────────────────────────────────────────── */
  skinned?: boolean;
  boardSkin?: BoardSkin;
  boardStyle?: ControlStyle;
  onParamChange?: (slotIndex: number, effectId: number, paramIndex: number, value: number) => void;
  onOpenPicker?: (slotIndex: number) => void;
  onBlockSkinChange?: (slotIndex: number, change: BlockSkin) => void;
  /** Move an FX loop marker to a chain position (1..11). */
  onFxPositionChange?: (kind: FxMarkerKind, position: number) => void;
  /** Board-wide label grey, as a lightness percentage. */
  labelLum?: number;
  onLabelLumChange?: (lum: number) => void;
}

/**
 * The chain as a vertical list, in signal order, top to bottom.
 *
 * This replaces the board's horizontal stage outright. The stage needs ~2200px
 * for eleven fixed-width enclosures, which on a phone means a horizontal
 * scroller whose axis collides with every knob drag inside it. A vertical list
 * removes the conflict rather than tuning it, and puts the whole chain in one
 * reading order.
 *
 * Reorder is always available from each row's grip , there is no edit mode,
 * because a mode would put a tap between the user and the most physical
 * operation in the app.
 */
export function ChainScreen({
  preset,
  artIndex,
  scrollRef,
  onToggle,
  onMove,
  onOpenFxLoop,
  skinned = false,
  boardSkin = {},
  boardStyle = 'dial',
  onParamChange,
  onOpenPicker,
  onBlockSkinChange,
  onFxPositionChange,
  labelLum,
  onLabelLumChange,
}: ChainScreenProps) {
  // Which cards have their controls open, by block position so the set
  // survives a reorder.
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const listRef = useRef<HTMLUListElement>(null);
  const chain = preset.effects;

  // A marker insert is its own gesture: boundaries, not slots, and nothing
  // else on the list moves. See useFxMarkerDrag for why it is not the hook
  // above wearing a different hat.
  const fxDrag = useFxMarkerDrag({
    scrollRef,
    listRef,
    itemCount: chain.length,
    onCommit: (kind, position) => onFxPositionChange?.(kind, position),
  });

  const drag = useDragReorder({
    scrollRef,
    listRef,
    itemCount: chain.length,
    onCommit: onMove,
  });

  return (
    <div className="m-screen">
      <div className="m-screen-head">
        <h2 className="m-screen-title">SIGNAL CHAIN</h2>
        <span className="m-screen-hint">DRAG ⠿ TO REORDER</span>
      </div>

      {/* Rows render in plain chain order at all times. During a drag, GSAP
          moves them by transform and the real reorder is committed once, on
          drop , so layout stays frozen and the animation geometry stays exact
          (see useDragReorder). */}
      <ul
        className={`m-list${drag.from !== null ? ' dragging' : ''}${skinned ? ' m-pk-chain' : ''}`}
        ref={listRef}
      >
        <li className="m-marker">
          <span>IN</span>
        </li>

        {chain.map((slot, position) => (
          <li
            key={slot.slotIndex}
            className="m-row-wrap"
            // The boundary a dragged marker would land on. It is the bottom
            // edge of this row, which is exactly what "after block N" means.
            data-fx-drop={fxDrag.target === position + 1 ? fxDrag.kind : undefined}
          >
            <ChainRow
              skinned={skinned}
              blockSkin={blockSkin(boardSkin, slot.slotIndex)}
              controlStyle={styleFor(boardSkin, slot.slotIndex, boardStyle)}
              expanded={expanded.has(slot.slotIndex)}
              onToggleExpand={() => setExpanded((open) => {
                const next = new Set(open);
                if (!next.delete(slot.slotIndex)) next.add(slot.slotIndex);
                return next;
              })}
              onParamChange={
                onParamChange && ((paramIdx, value) =>
                  onParamChange(slot.slotIndex, slot.effectId, paramIdx, value))
              }
              onOpenPicker={onOpenPicker && (() => onOpenPicker(slot.slotIndex))}
              onSkinChange={
                onBlockSkinChange && ((change) => onBlockSkinChange(slot.slotIndex, change))
              }
              labelLum={labelLum}
              onLabelLumChange={onLabelLumChange}
              slot={slot}
              index={position}
              displayIndex={displayPosition(position, drag.from, drag.target)}
              chainLength={chain.length}
              art={lookupPedalArt(artIndex, slot.effectId)}
              onToggle={() => onToggle(slot.slotIndex, slot.enabled)}
              onMove={onMove}
              onDragHandleDown={drag.start}
              dragging={drag.from === position}
            />

            {/* The patch cable out of this block. Drawn before any FX marker at
                this position so every card visibly has a lead leaving it —
                a marker is a label on the run, not a break in it. The last
                block runs to OUT, which the marker below already draws. */}
            {position < chain.length - 1 && <ChainCable />}

            {/* FX loop send/return are chain positions (1..11), so they render
                between rows exactly where they sit in the signal path. They
                stay mounted during a drag: a marker belongs to a position, not
                to a block, so it correctly holds still while blocks move past
                it , and keeping it in the flow is what makes the measured slot
                geometry valid for the whole gesture. */}
            {preset.fxLoopSend === position + 1 && (
              <FxMarker
                kind="send"
                label="↗ FX SEND"
                color={FX_SEND_COLOR}
                draggable={Boolean(onFxPositionChange)}
                dragging={fxDrag.kind === 'send'}
                offsetY={fxDrag.kind === 'send' ? fxDrag.offsetY : 0}
                onGripDown={(e) => fxDrag.start('send', e)}
                onEdit={onOpenFxLoop}
              />
            )}
            {preset.fxLoopReturn === position + 1 && (
              <FxMarker
                kind="return"
                label="↘ FX RETURN"
                color={FX_RETURN_COLOR}
                draggable={Boolean(onFxPositionChange)}
                dragging={fxDrag.kind === 'return'}
                offsetY={fxDrag.kind === 'return' ? fxDrag.offsetY : 0}
                onGripDown={(e) => fxDrag.start('return', e)}
                onEdit={onOpenFxLoop}
              />
            )}
          </li>
        ))}

        <li className="m-marker">
          <span>OUT</span>
        </li>
      </ul>
    </div>
  );
}
