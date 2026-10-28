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

function renderPedal() {
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
