import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChainScreen } from '@/components/mobile/ChainScreen';
import { createDefaultPreset } from '@/core/defaultPreset';
import { getEffectName } from '@/core/effectNames';

function renderChain(overrides: Partial<Parameters<typeof ChainScreen>[0]> = {}) {
  const preset = createDefaultPreset();
  const props = {
    preset,
    artIndex: null,
    scrollRef: createRef<HTMLElement>(),
    onToggle: vi.fn(),
    onMove: vi.fn(),
    onOpenFxLoop: vi.fn(),
    onOpenPicker: vi.fn(),
    ...overrides,
  };
  const utils = render(<ChainScreen {...props} />);
  return { props, preset, ...utils };
}

describe('ChainScreen', () => {
  it('marks only the pedal cards as drag rows', () => {
    // useDragReorder measures [data-drag-row] once at pickup and then moves
    // exactly those elements. A cable or an FX marker caught by that selector
    // would be dragged around as if it were a block, and the gap it belongs to
    // would stop lining up with anything.
    const { preset, container } = renderChain();
    const rows = container.querySelectorAll('[data-drag-row]');
    expect(rows.length).toBe(preset.effects.length);
    for (const row of rows) expect(row.classList.contains('m-pedal-card')).toBe(true);

    for (const cable of container.querySelectorAll('.m-cable')) {
      expect(cable.hasAttribute('data-drag-row')).toBe(false);
    }
    for (const marker of container.querySelectorAll('.m-marker')) {
      expect(marker.hasAttribute('data-drag-row')).toBe(false);
    }
  });

  it('runs a cable into every block but the last', () => {
    const { preset, container } = renderChain();
    expect(container.querySelectorAll('.m-cable').length).toBe(preset.effects.length - 1);
  });

  it('builds a valid list: every child of the <ul> is an <li>', () => {
    const { container } = renderChain();
    const list = container.querySelector('ul.m-list')!;
    for (const child of list.children) expect(child.tagName).toBe('LI');
  });

  it('still reorders from the grip with the keyboard', () => {
    // Dragging is pointer-only, so the grip is the sole route to reordering
    // without a pointing device.
    const { props, preset } = renderChain();
    const second = getEffectName(preset.effects[1].effectId);
    const grip = screen.getByLabelText(new RegExp(`^Reorder ${second}, position 2 of 11`));

    fireEvent.keyDown(grip, { key: 'ArrowUp' });
    expect(props.onMove).toHaveBeenCalledWith(1, 0);

    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    expect(props.onMove).toHaveBeenLastCalledWith(1, 2);
  });

  it('opens the effect browser from its card body and toggles from its switch', () => {
    const { props, preset } = renderChain();
    const first = preset.effects[0];
    const name = getEffectName(first.effectId);

    // The card body used to push a second screen to edit the block. The card
    // opens its own controls in place now, so the body means one thing.
    fireEvent.click(screen.getByText(name));
    expect(props.onOpenPicker).toHaveBeenCalledWith(first.slotIndex);

    fireEvent.click(screen.getByLabelText(`${name} ${first.enabled ? 'on' : 'bypassed'}`));
    expect(props.onToggle).toHaveBeenCalledWith(first.slotIndex, first.enabled);
  });
});
