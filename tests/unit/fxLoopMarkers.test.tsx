import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FxLoopArrows } from '@/components/FxLoopArrows';
import { FxMarker } from '@/components/mobile/FxMarker';
import { FX_RETURN_COLOR, FX_SEND_COLOR } from '@/core/boardSkin';

function renderArrows(send = 4, ret = 8) {
  const onSendChange = vi.fn();
  const onReturnChange = vi.fn();
  const { container } = render(
    <FxLoopArrows send={send} ret={ret} onSendChange={onSendChange} onReturnChange={onReturnChange} />,
  );
  return { container, onSendChange, onReturnChange };
}

const gap = (container: HTMLElement, n: number) =>
  container.querySelector(`[data-gap="${n}"]`) as HTMLElement;

describe('FxLoopArrows: two bands', () => {
  it('puts the markers above the names they sit between', () => {
    // Reading down you meet the marker, then what it is between. The order is
    // load-bearing: swap it and the triangles point at nothing.
    const { container } = renderArrows();
    const bands = [...(container.firstElementChild as HTMLElement).children];
    expect(bands[0].querySelector('[data-gap]')).not.toBeNull();
    expect(bands[1].querySelector('[data-gap]')).toBeNull();
    expect(bands[1].textContent).toContain('PRE');
  });

  it('offers a drop gap after every block, VOL included', () => {
    // Position 11 puts the loop after the whole chain, which is what the
    // 4-cable method uses and what real device exports store.
    const { container } = renderArrows();
    expect(container.querySelectorAll('[data-gap]')).toHaveLength(11);
    expect(gap(container, 11)).not.toBeNull();
  });

  it('lands each marker in its own gap, in the loop colours', () => {
    const { container } = renderArrows(4, 8);
    const send = within(gap(container, 4)).getByTitle('Send');
    const ret = within(gap(container, 8)).getByTitle('Return');
    expect(send).toHaveStyle({ color: FX_SEND_COLOR });
    expect(ret).toHaveStyle({ color: FX_RETURN_COLOR });
    expect(gap(container, 4).querySelector('[title="Return"]')).toBeNull();
  });

  it('stacks both in one gap when the loop is bypassed', () => {
    const { container } = renderArrows(5, 5);
    const both = gap(container, 5).querySelectorAll('[role="slider"]');
    expect(both).toHaveLength(2);
    // send first, so it sits above return in the column
    expect(both[0]).toHaveAttribute('title', 'FX Loop bypass (Send = Return)');
  });

  it('walks a marker with the arrow keys', () => {
    const { container, onSendChange } = renderArrows(4, 8);
    const send = within(gap(container, 4)).getByTitle('Send');
    fireEvent.keyDown(send, { key: 'ArrowRight' });
    expect(onSendChange).toHaveBeenCalledWith(5);
    fireEvent.keyDown(send, { key: 'ArrowLeft' });
    expect(onSendChange).toHaveBeenLastCalledWith(3);
  });

  it('will not walk a marker off either end', () => {
    const first = renderArrows(1, 8);
    fireEvent.keyDown(within(gap(first.container, 1)).getByTitle('Send'), { key: 'ArrowLeft' });
    expect(first.onSendChange).toHaveBeenCalledWith(1);

    const last = renderArrows(4, 11);
    fireEvent.keyDown(within(gap(last.container, 11)).getByTitle('Return'), { key: 'ArrowRight' });
    expect(last.onReturnChange).toHaveBeenCalledWith(11);
  });
});

describe('FxMarker: two handles, no modes', () => {
  const renderMarker = (draggable = true) => {
    const onGripDown = vi.fn();
    const onEdit = vi.fn();
    render(
      <FxMarker
        kind="send"
        label="FX SEND"
        color={FX_SEND_COLOR}
        draggable={draggable}
        dragging={false}
        offsetY={0}
        onGripDown={onGripDown}
        onEdit={onEdit}
      />,
    );
    return { onGripDown, onEdit };
  };

  it('keeps EDIT beside the grip, because dragging is pointer-only', () => {
    const { onEdit } = renderMarker();
    expect(screen.getByLabelText(/Move the FX loop send/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('EDIT'));
    expect(onEdit).toHaveBeenCalled();
  });

  it('drops the grip when the position cannot be changed, and keeps EDIT', () => {
    renderMarker(false);
    expect(screen.queryByLabelText(/Move the FX loop send/)).toBeNull();
    expect(screen.getByText('EDIT')).toBeInTheDocument();
  });

  it('starts the drag from the grip only', () => {
    const { onGripDown } = renderMarker();
    fireEvent.pointerDown(screen.getByLabelText(/Move the FX loop send/));
    expect(onGripDown).toHaveBeenCalled();
  });
});
