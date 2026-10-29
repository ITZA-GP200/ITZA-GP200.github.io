import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pedal } from '@/components/board/Pedal';
import type { EffectSlot } from '@/core/types';

const SLOT: EffectSlot = {
  slotIndex: 8,
  enabled: true,
  effectId: 1,
  params: new Array(15).fill(0),
};

function renderPedal(extra: Record<string, unknown> = {}) {
  const onDragStart = vi.fn();
  const { container } = render(
    <Pedal
      slot={SLOT}
      index={0}
      chainLength={11}
      onToggle={() => {}}
      onOpenPicker={() => {}}
      onParamChange={() => {}}
      onDragStart={onDragStart}
      onMove={() => {}}
      onInspect={() => {}}
      onPin={() => {}}
      isPinned={false}
      skinned
      onSkinChange={() => {}}
      labelLum={57}
      onLabelLumChange={() => {}}
      {...extra}
    />,
  );
  const article = container.querySelector('article.pedal') as HTMLElement;
  return { article, onDragStart };
}

/** dragstart always fires on the draggable element, whatever was pressed. */
function dragFrom(pressed: Element, article: HTMLElement) {
  fireEvent.pointerDown(pressed);
  return fireEvent.dragStart(article, {
    dataTransfer: { setData: () => {}, effectAllowed: '' },
  });
}

describe('Pedal: the tool cluster keeps the pointer', () => {
  it('refuses the reorder drag when the press began on a tool', () => {
    const { article, onDragStart } = renderPedal();
    // The brightness slider's gesture IS press-and-slide; without this guard
    // the browser reorders the pedal instead of moving the thumb.
    const notCancelled = dragFrom(screen.getByLabelText('DLY key colour'), article);
    expect(notCancelled).toBe(false);
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('still drags from the card itself', () => {
    const { article, onDragStart } = renderPedal();
    expect(dragFrom(article, article)).toBe(true);
    expect(onDragStart).toHaveBeenCalledWith(0);
  });

  it('goes back to dragging after a press on a tool and one on the card', () => {
    const { article, onDragStart } = renderPedal();
    dragFrom(screen.getByLabelText('DLY key colour'), article);
    expect(onDragStart).not.toHaveBeenCalled();
    expect(dragFrom(article, article)).toBe(true);
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });
});

/**
 * The bay under a card is a drop target for two different drags — reordering
 * the chain, and moving an FX loop marker. They are told apart by the drag's
 * payload, and nothing else: get this wrong and moving the loop silently
 * reorders the chain instead, which looks like the board rearranging itself.
 */
describe('Pedal: the FX loop markers are their own drag', () => {
  it('says which marker was picked up, and does not start a reorder', () => {
    const { article, onDragStart } = renderPedal({ fxSend: true });
    const marker = article.querySelector('.pk-fx.out') as HTMLElement;
    const data: Record<string, string> = {};
    const dataTransfer = {
      setData: (k: string, v: string) => { data[k] = v; },
      getData: (k: string) => data[k] ?? '',
      effectAllowed: '',
    };
    fireEvent.dragStart(marker, { dataTransfer });
    expect(data['text/plain']).toBe('fx:send');
    // the card's own dragstart must not have fired alongside it
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('marks return separately from send', () => {
    const { article } = renderPedal({ fxReturn: true });
    const marker = article.querySelector('.pk-fx.in') as HTMLElement;
    const data: Record<string, string> = {};
    fireEvent.dragStart(marker, {
      dataTransfer: { setData: (k: string, v: string) => { data[k] = v; }, effectAllowed: '' },
    });
    expect(data['text/plain']).toBe('fx:return');
  });

  it('walks a marker along the chain with the arrow keys', () => {
    const fxMove = vi.fn();
    const { article } = renderPedal({ fxSend: true, fxMove });
    const marker = article.querySelector('.pk-fx.out') as HTMLElement;
    fireEvent.keyDown(marker, { key: 'ArrowRight' });
    expect(fxMove).toHaveBeenCalledWith('send', 1);
    fireEvent.keyDown(marker, { key: 'ArrowLeft' });
    expect(fxMove).toHaveBeenLastCalledWith('send', -1);
  });

  it('draws no marker on a block the loop does not touch', () => {
    const { article } = renderPedal();
    expect(article.querySelector('.pk-fx')).toBeNull();
  });
});
