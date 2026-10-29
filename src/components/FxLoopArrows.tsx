import { useRef } from 'react';
import { FX_RETURN_COLOR, FX_SEND_COLOR } from '@/core/boardSkin';

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

/**
 * Eleven labels and eleven drop targets share a 375px row, which leaves each
 * gap about 18px — the whole reason these were hard to hit. The marker is
 * allowed to spill symmetrically past its gap so the target is wider than the
 * space it sits in, stopping just short of the ~32px pitch between gap centres
 * so two targets can never overlap and leave the drop ambiguous.
 */
const MARKER_W = 30;

/**
 * Up for the signal leaving, down for it coming back.
 *
 * Solid, like the flow chevrons between the cards: a filled triangle holds its
 * shape at this size where a stroked one starts to read as two thin lines, and
 * it is the same mark the chain already uses to mean "the signal goes this
 * way". Local to this component on purpose — the phone card's disclosure caret
 * says something else entirely, and tying the two together would mean neither
 * could change on its own.
 */
function Chevron({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg
      width="15"
      height="11"
      viewBox="0 0 24 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={dir === 'up' ? 'M12 2 23 15 1 15Z' : 'M1 1 23 1 12 14Z'} />
    </svg>
  );
}

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
      style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, padding: '6px 4px' }}
    >
      <div className="flex items-stretch justify-between gap-1 text-label uppercase tracking-wider">
        {BLOCKS.map((name, idx) => (
          <div key={name} className="flex items-center" style={{ flex: '1 1 0', minWidth: 0 }}>
            <span className="px-1" style={{ color: BLOCK_LABEL }}>{name}</span>
            {/* One drop gap after every block, VOL included: position 11 puts
                the loop after the whole chain, which is what the 4-cable
                method uses and what real device exports store.

                Column, centred: with both markers here they stack send over
                return, and with one it sits in the middle of the row on its
                own — no nudging either into place, which is what left a lone
                marker looking off-centre before. */}
            <div
                role="presentation"
                data-gap={idx + 1}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx + 1)}
                className="relative flex-1 flex flex-col items-center justify-center"
                style={{ minHeight: 40 }}
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
                      width: MARKER_W,
                      marginInline: `calc((100% - ${MARKER_W}px) / 2)`,
                      minHeight: 20,
                    }}
                  >
                    <Chevron dir="up" />
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
                      width: MARKER_W,
                      marginInline: `calc((100% - ${MARKER_W}px) / 2)`,
                      minHeight: 20,
                    }}
                  >
                    <Chevron dir="down" />
                  </button>
                )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
