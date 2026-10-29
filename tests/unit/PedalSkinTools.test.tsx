import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PedalSkinTools } from '@/components/board/PedalSkinTools';
import { LABEL_LUM_MAX, LABEL_LUM_MIN, type BlockSkin } from '@/core/boardSkin';

function open(props: Partial<Parameters<typeof PedalSkinTools>[0]> = {}) {
  const onLabelLumChange = vi.fn();
  function Host() {
    const [lum, setLum] = useState(57);
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
        {...props}
      />
    );
  }
  render(<Host />);
  fireEvent.click(screen.getByLabelText('DLY key colour'));
  return { onLabelLumChange };
}

const slider = () => screen.getByRole('slider') as HTMLInputElement;

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
