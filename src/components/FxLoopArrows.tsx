import { useRef } from 'react';
import { FX_RETURN_COLOR, FX_SEND_COLOR } from '@/core/boardSkin';
import { FxTriangle } from './FxTriangle';

interface FxLoopArrowsProps {
  /** Current SEND position (1..11); 11 = after the last block. */
  send: number;
  /** Current RETURN position (1..11); 11 = after the last block. */
  ret: number;
  /** Called when the user drags or keyboard-shifts SEND. New position is unclamped; parent clamps + push-constraints. */
  onSendChange: (pos: number) => void;
  onReturnChange: (pos: number) => void;
}

const BLOCKS = ['PRE', 'WAH', 'BST', 'AMP', 'NR', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB', 'VOL'];

/**
 * The abbreviations sat at 50% opacity over an already-muted colour, which on
 * the dark stage left them barely there. One fixed grey, bright enough to read
 * at this size: these are the labels you are aiming the markers between, so
 * they cannot be the dimmest thing in the panel.
 */
const BLOCK_LABEL = 'hsl(240 4% 75%)';

/** Marker height: the touch target, comfortably larger than the 13px glyph. */
const MARKER_H = 20;

/**
 * Two bands, not one row.
 *
 * Eleven labels and eleven drop targets cannot share a 375px row: the labels
 * need about 20px each, which left every target an 11px sliver and the
 * triangle sitting on the text either side of it. So the labels keep the top
 * band to themselves and the markers get their own underneath, where each one
 * is free to be a whole column wide.
 *
 * Alignment is structural rather than measured: both bands are the same
 * eleven flex columns, and a marker is absolutely placed over the RIGHT EDGE
 * of its column — which is exactly the boundary "after this block" means. One
 * column wide and centred on that edge, so the targets tile the band with no
 * dead strip between them. The last boundary sits past the final column, so
 * both bands carry a trailing half column: equal widths and somewhere for it
 * to land, neither of them guessed.
 */

export function FxLoopArrows({ send, ret, onSendChange, onReturnChange }: FxLoopArrowsProps) {
  const dragKindRef = useRef<'send' | 'return' | null>(null);
  const bypass = send === ret;

  function handleArrowKey(kind: 'send' | 'return', e: React.KeyboardEvent<HTMLButtonElement>) {
    const current = kind === 'send' ? send : ret;
    let next = current;
    if (e.key === 'ArrowRight') next = Math.min(11, current + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(1, current - 1);
    else return;
    e.preventDefault();
    (kind === 'send' ? onSendChange : onReturnChange)(next);
  }

  function handleDragStart(kind: 'send' | 'return', e: React.DragEvent<HTMLButtonElement>) {
    dragKindRef.current = kind;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', kind);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(gap: number) {
    if (dragKindRef.current === 'send') onSendChange(gap);
    else if (dragKindRef.current === 'return') onReturnChange(gap);
    dragKindRef.current = null;
  }

  return (
    <div
      className="relative mb-2 font-mono-display select-none"
      style={{
        background: 'rgba(0,0,0,0.03)',
        border: '1px solid rgba(0,0,0,0.10)',
        borderRadius: 8,
        padding: '4px 4px',
      }}
    >
      {/* band one: one drop target per boundary, each a full column wide and
          centred on the edge it belongs to. A gap holding both markers stacks
          send over return; a gap holding one centres it in the band. */}
      {/* Exactly two markers tall and not a pixel more. The band only exists
          so a gap holding both can stack them; any slack beyond that reads as
          a gap between the chevrons and the labels they point between. */}
      <div className="flex" style={{ minHeight: MARKER_H * 2 }}>
        {BLOCKS.map((name, idx) => (
          <div key={name} className="relative" style={{ flex: '1 1 0', minWidth: 0 }}>
            {/* One drop gap after every block, VOL included: position 11 puts
                the loop after the whole chain, which is what the 4-cable
                method uses and what real device exports store. */}
            <div
              role="presentation"
              data-gap={idx + 1}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(idx + 1)}
              className="absolute top-0 bottom-0 flex flex-col items-center justify-center"
              style={{ right: '-50%', width: '100%' }}
            >
              {send === idx + 1 && (
                <button
                  type="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(e) => handleDragStart('send', e)}
                  onKeyDown={(e) => handleArrowKey('send', e)}
                  aria-label={idx < 10 ? `FX Loop Send position, currently between effects ${idx + 1} and ${idx + 2}` : 'FX Loop Send position, currently after the last effect'}
                  aria-valuemin={1}
                  aria-valuemax={11}
                  aria-valuenow={send}
                  role="slider"
                  data-bypass={bypass}
                  title={bypass ? 'FX Loop bypass (Send = Return)' : 'Send'}
                  className="flex items-center justify-center leading-none cursor-grab"
                  style={{
                    color: FX_SEND_COLOR,
                    opacity: bypass ? 0.5 : 1,
                    alignSelf: 'stretch',
                    minHeight: MARKER_H,
                  }}
                >
                  <FxTriangle dir="up" size={20} />
                </button>
              )}
              {ret === idx + 1 && (
                <button
                  type="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(e) => handleDragStart('return', e)}
                  onKeyDown={(e) => handleArrowKey('return', e)}
                  aria-label={idx < 10 ? `FX Loop Return position, currently between effects ${idx + 1} and ${idx + 2}` : 'FX Loop Return position, currently after the last effect'}
                  aria-valuemin={1}
                  aria-valuemax={11}
                  aria-valuenow={ret}
                  role="slider"
                  data-bypass={bypass}
                  title={bypass ? 'FX Loop bypass (Send = Return)' : 'Return'}
                  className="flex items-center justify-center leading-none cursor-grab"
                  style={{
                    color: FX_RETURN_COLOR,
                    opacity: bypass ? 0.5 : 1,
                    alignSelf: 'stretch',
                    minHeight: MARKER_H,
                  }}
                >
                  <FxTriangle dir="down" size={20} />
                </button>
              )}
            </div>
          </div>
        ))}
        <div aria-hidden="true" style={{ flex: '0.5 1 0' }} />
      </div>
      {/* band two: the blocks the markers above are sitting between */}
      <div className="flex text-label uppercase tracking-wider">
        {BLOCKS.map((name) => (
          <div
            key={name}
            className="text-center"
            style={{ flex: '1 1 0', minWidth: 0, color: BLOCK_LABEL }}
          >
            {name}
          </div>
        ))}
        {/* Half a column, in both bands, so they keep identical column widths
            AND the boundary after the last block has somewhere to sit. A
            guessed right padding cannot do both; this is exact by
            construction. */}
        <div aria-hidden="true" style={{ flex: '0.5 1 0' }} />
      </div>

    </div>
  );
}
