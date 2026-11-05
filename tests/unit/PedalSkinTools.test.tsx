import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PedalSkinTools } from '@/components/board/PedalSkinTools';
import {
  LABEL_LUM_MAX,
  LABEL_LUM_MIN,
  LABEL_SIZE_MAX,
  LABEL_SIZE_MIN,
  type BlockSkin,
} from '@/core/boardSkin';

function open(props: Partial<Parameters<typeof PedalSkinTools>[0]> = {}) {
  const onLabelLumChange = vi.fn();
  const onLabelSizeChange = vi.fn();
  function Host() {
    const [lum, setLum] = useState(57);
    const [size, setSize] = useState(100);
    return (
      <PedalSkinTools
        moduleName="DLY"
        skin={{}}
        style="dial"
        keyColor="#7c6cf0"
        onChange={() => {}}
        labelLum={lum}
        onLabelLumChange={(next) => {
          onLabelLumChange(next);
          setLum(next);
        }}
        labelSize={size}
        onLabelSizeChange={(next) => {
          onLabelSizeChange(next);
          setSize(next);
        }}
        {...props}
      />
    );
  }
  render(<Host />);
  fireEvent.click(screen.getByLabelText('DLY key colour'));
  return { onLabelLumChange, onLabelSizeChange };
}

/** The popover carries two sliders; each is found by its own label. */
const slider = () =>
  screen.getByLabelText(/LABEL BRIGHTNESS/) as HTMLInputElement;
const sizeSlider = () => screen.getByLabelText(/LABEL SIZE/) as HTMLInputElement;

describe('PedalSkinTools: label brightness', () => {
  it('turns with the wheel, up and down', () => {
    const { onLabelLumChange } = open();
    fireEvent.wheel(slider(), { deltaY: -100 });
    expect(onLabelLumChange).toHaveBeenLastCalledWith(60);
    fireEvent.wheel(slider(), { deltaY: 100 });
    expect(onLabelLumChange).toHaveBeenLastCalledWith(57);
  });

  it('takes a fine step with Shift held', () => {
    const { onLabelLumChange } = open();
    fireEvent.wheel(slider(), { deltaY: -100, shiftKey: true });
    expect(onLabelLumChange).toHaveBeenLastCalledWith(58);
  });

  it('cancels the page scroll it would otherwise cause', () => {
    open();
    const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    slider().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('still opens on a locked block, with the colours frozen', () => {
    const locked: BlockSkin = { locked: true };
    open({ skin: locked });
    // the board-wide slider is not what the lock froze
    expect(slider()).toBeEnabled();
    for (const chip of screen.getAllByRole('button', { name: /^#[0-9a-f]{6}$/i })) {
      expect(chip).toBeDisabled();
    }
  });

  it('offers only the slider range', () => {
    open();
    expect(slider().min).toBe(String(LABEL_LUM_MIN));
    expect(slider().max).toBe(String(LABEL_LUM_MAX));
  });
});

/**
 * Label Size sits directly under brightness because it answers the same
 * question. It is a second native range for the same reasons: it drags, it
 * takes arrow keys, and it works under a thumb on the phone card.
 */
describe('PedalSkinTools: label size', () => {
  it('is a second slider, not a replacement for the first', () => {
    open();
    expect(screen.getAllByRole('slider')).toHaveLength(2);
  });

  it('turns with the wheel in steps of its own scale', () => {
    const { onLabelSizeChange, onLabelLumChange } = open();
    fireEvent.wheel(sizeSlider(), { deltaY: -100 });
    expect(onLabelSizeChange).toHaveBeenLastCalledWith(105);
    fireEvent.wheel(sizeSlider(), { deltaY: 100 });
    expect(onLabelSizeChange).toHaveBeenLastCalledWith(100);
    // the two sliders are independent: turning one must not move the other
    expect(onLabelLumChange).not.toHaveBeenCalled();
  });

  it('takes a fine step with Shift held', () => {
    const { onLabelSizeChange } = open();
    fireEvent.wheel(sizeSlider(), { deltaY: -100, shiftKey: true });
    expect(onLabelSizeChange).toHaveBeenLastCalledWith(101);
  });

  it('cancels the page scroll it would otherwise cause', () => {
    open();
    const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    sizeSlider().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('reports a drag through', () => {
    const { onLabelSizeChange } = open();
    fireEvent.change(sizeSlider(), { target: { value: '125' } });
    expect(onLabelSizeChange).toHaveBeenLastCalledWith(125);
  });

  it('cannot be pushed past the ceiling, by a drag or by anything else', () => {
    // The native range clamps it, which is half the reason this is a range
    // and not a bespoke control: past the ceiling the cards drop to one
    // control per row and the board stops fitting the stage.
    const { onLabelSizeChange } = open();
    fireEvent.change(sizeSlider(), { target: { value: '400' } });
    expect(onLabelSizeChange).toHaveBeenLastCalledWith(LABEL_SIZE_MAX);
    fireEvent.change(sizeSlider(), { target: { value: '10' } });
    expect(onLabelSizeChange).toHaveBeenLastCalledWith(LABEL_SIZE_MIN);
  });

  it('offers only the slider range, and is not what the lock freezes', () => {
    open({ skin: { locked: true } });
    expect(sizeSlider().min).toBe(String(LABEL_SIZE_MIN));
    expect(sizeSlider().max).toBe(String(LABEL_SIZE_MAX));
    expect(sizeSlider()).toBeEnabled();
  });

  it('is absent when the board does not offer the setting', () => {
    open({ onLabelSizeChange: undefined });
    expect(screen.getAllByRole('slider')).toHaveLength(1);
    expect(screen.queryByLabelText(/LABEL SIZE/)).toBeNull();
  });
});
