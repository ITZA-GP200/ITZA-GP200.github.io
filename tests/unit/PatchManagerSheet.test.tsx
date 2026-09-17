import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PatchManagerSheet } from '@/components/PatchManagerSheet';

function makeNames(): (string | null)[] {
  const names = new Array<string | null>(256).fill(null);
  names[0] = 'Clean';
  names[1] = 'Crunch';
  names[248] = 'American Idiot';
  return names;
}

function renderSheet(overrides: Partial<Parameters<typeof PatchManagerSheet>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    connected: true,
    presetNames: makeNames(),
    namesLoadProgress: 256,
    currentSlot: 0,
    onActivate: vi.fn(),
    onOpenInEditor: vi.fn().mockResolvedValue(undefined),
    onExportSlot: vi.fn().mockResolvedValue(undefined),
    onExportSlots: vi.fn().mockResolvedValue(undefined),
    bulkProgress: null,
    onCancelBulk: vi.fn(),
    onImportToSlot: vi.fn().mockResolvedValue(undefined),
    onCopySlot: vi.fn().mockResolvedValue(undefined),
    onPasteToSlot: vi.fn().mockResolvedValue(undefined),
    onSwapSlots: vi.fn().mockResolvedValue(undefined),
    clipboardLabel: null as string | null,
    onRenameSlot: vi.fn().mockResolvedValue(undefined),
    onRefreshNames: vi.fn(),
    onImportFile: vi.fn(),
    onExportRequest: vi.fn(),
    userIrNames: [] as string[],
    ...overrides,
  };
  const utils = render(<PatchManagerSheet {...props} />);
  return { props, ...utils };
}

describe('PatchManagerSheet', () => {
  it('renders the patch browser with loaded names', () => {
    renderSheet();
    expect(screen.getByText('Clean')).toBeTruthy();
    expect(screen.getByText('American Idiot')).toBeTruthy();
    expect(screen.getByText('now: 1A')).toBeTruthy();
  });

  it('filters slots via search', () => {
    renderSheet();
    fireEvent.change(screen.getByPlaceholderText(/Search patches/), {
      target: { value: 'crunch' },
    });
    expect(screen.getByText('Crunch')).toBeTruthy();
    expect(screen.queryByText('American Idiot')).toBeNull();
  });

  it('activates the selected slot', () => {
    const { props } = renderSheet();
    fireEvent.click(screen.getByText('Crunch'));
    fireEvent.click(screen.getByText('ACTIVATE'));
    expect(props.onActivate).toHaveBeenCalledWith(1);
  });

  it('exports the selected bank (4 slots)', () => {
    const { props } = renderSheet();
    fireEvent.click(screen.getByText('Crunch')); // slot 1 → bank slots 0..3
    fireEvent.click(screen.getByText('EXPORT BANK'));
    expect(props.onExportSlots).toHaveBeenCalledWith([0, 1, 2, 3]);
  });

  it('disables slot actions while disconnected', () => {
    renderSheet({ connected: false });
    const activate = screen.getByText('ACTIVATE').closest('button');
    expect(activate?.disabled).toBe(true);
  });

  it('editor-file export works offline and closes the sheet first', () => {
    const { props } = renderSheet({ connected: false });
    const exportButton = screen.getByText('EXPORT .PRST').closest('button');
    expect(exportButton?.disabled).toBe(false);
    fireEvent.click(exportButton!);
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onExportRequest).toHaveBeenCalled();
  });

  it('lists User-IR slots behind a collapsible toggle when connected', () => {
    renderSheet({ userIrNames: ['My 4x12', 'User IR', 'User IR'] });
    const toggle = screen.getByText(/USER IRS \(3\)/);
    expect(screen.queryByText('My 4x12')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText('My 4x12')).toBeTruthy();
    expect(screen.getAllByText('User IR')).toHaveLength(2);
  });

  it('hides the User-IR section offline and when the sweep returned nothing', () => {
    renderSheet({ userIrNames: [] });
    expect(screen.queryByText(/USER IRS/)).toBeNull();
    renderSheet({ connected: false, userIrNames: ['User IR'] });
    expect(screen.queryByText(/USER IRS/)).toBeNull();
  });

  it('shows bulk progress with a cancel control', () => {
    const { props } = renderSheet({ bulkProgress: { done: 12, total: 256 } });
    expect(screen.getByText('12/256')).toBeTruthy();
    fireEvent.click(screen.getByText('cancel'));
    expect(props.onCancelBulk).toHaveBeenCalled();
  });

  it('commits a rename through the inline input', async () => {
    const { props } = renderSheet();
    fireEvent.click(screen.getByText('Crunch'));
    fireEvent.click(screen.getByText('RENAME'));
    const input = screen.getByDisplayValue('Crunch');
    fireEvent.change(input, { target: { value: 'Lead Boost' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await vi.waitFor(() => {
      expect(props.onRenameSlot).toHaveBeenCalledWith(1, 'Lead Boost');
    });
  });
});

describe('PatchManagerSheet: selection and arrange', () => {
  it('shift-clicking a second row selects the range between them', () => {
    renderSheet();
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByText('Crunch'), { shiftKey: true });
    expect(screen.getByRole('status')).toHaveTextContent('2 selected');
  });

  it('SELECT BANK picks all four slots in the bank', () => {
    renderSheet();
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByRole('button', { name: 'SELECT BANK' }));
    expect(screen.getByRole('status')).toHaveTextContent('4 selected');
  });

  it('CLEAR drops back to the single anchor row', () => {
    renderSheet();
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByRole('button', { name: 'SELECT BANK' }));
    fireEvent.click(screen.getByRole('button', { name: 'CLEAR' }));
    expect(screen.getByRole('status')).not.toHaveTextContent('selected');
  });

  it('EXPORT SELECTED sends every selected slot, not just the anchor', () => {
    const { props } = renderSheet();
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByRole('button', { name: 'SELECT BANK' }));
    fireEvent.click(screen.getByRole('button', { name: 'EXPORT SELECTED' }));
    expect(props.onExportSlots).toHaveBeenCalledWith([0, 1, 2, 3]);
  });

  it('PASTE stays disabled until something has been copied', () => {
    renderSheet();
    fireEvent.click(screen.getByText('Clean'));
    expect(screen.getByRole('button', { name: /^PASTE/ })).toBeDisabled();
  });

  it('PASTE targets the selected slot once the clipboard has a patch', () => {
    const { props } = renderSheet({ clipboardLabel: '01-A' });
    fireEvent.click(screen.getByText('Crunch'));
    fireEvent.click(screen.getByRole('button', { name: /^PASTE/ }));
    expect(props.onPasteToSlot).toHaveBeenCalledWith(1);
  });

  it('SWAP needs exactly two slots selected', () => {
    const { props } = renderSheet();
    fireEvent.click(screen.getByText('Clean'));
    expect(screen.getByRole('button', { name: 'SWAP' })).toBeDisabled();
    fireEvent.click(screen.getByText('Crunch'), { shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'SWAP' }));
    expect(props.onSwapSlots).toHaveBeenCalledWith(0, 1);
  });

  it('DOWN swaps the selected patch with the slot below it', () => {
    const { props } = renderSheet();
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByRole('button', { name: '▼ DOWN' }));
    expect(props.onSwapSlots).toHaveBeenCalledWith(0, 1);
  });

  it('UP is unavailable on the very first slot', () => {
    renderSheet();
    fireEvent.click(screen.getByText('Clean'));
    expect(screen.getByRole('button', { name: '▲ UP' })).toBeDisabled();
  });
});

describe('PatchManagerSheet: errors', () => {
  it('shows a slot action failure inside the sheet, with a dismiss control', () => {
    const { props } = renderSheet({
      errorMessage: 'Failed to paste into 31D: 30D has changed since it was copied',
      onDismissError: vi.fn(),
    });
    expect(screen.getByRole('alert')).toHaveTextContent('30D has changed since it was copied');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(props.onDismissError).toHaveBeenCalled();
  });

  it('shows no alert when nothing failed', () => {
    renderSheet();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('PatchManagerSheet: right-click menu', () => {
  function openMenuOn(text: string) {
    fireEvent.contextMenu(screen.getByText(text), { clientX: 120, clientY: 140 });
    return screen.getByRole('menu', { name: 'Patch actions' });
  }

  it('opens on right-click and selects the row it was opened on', () => {
    renderSheet();
    const menu = openMenuOn('Crunch');
    expect(menu).toHaveTextContent('1 patch selected (1B)');
  });

  it('keeps an existing multi-selection when right-clicked inside it', () => {
    renderSheet();
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByText('Crunch'), { shiftKey: true });
    const menu = openMenuOn('Crunch');
    expect(menu).toHaveTextContent('2 patches selected · 1A–1B');
    expect(within(menu).getByRole('menuitem', { name: 'COPY' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('COPY copies the right-clicked slot and closes the menu', () => {
    const { props } = renderSheet();
    const menu = openMenuOn('Crunch');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'COPY' }));
    expect(props.onCopySlot).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('PASTE is unavailable until something has been copied', () => {
    renderSheet();
    const menu = openMenuOn('Crunch');
    const paste = within(menu).getByRole('menuitem', { name: /^PASTE/ });
    expect(paste).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(paste);
    expect(screen.queryByRole('dialog', { name: 'Paste options' })).toBeNull();
  });

  it('PASTE opens the paste options, and OK overwrites the right-clicked slot', () => {
    const { props } = renderSheet({ clipboardLabel: '1A' });
    const menu = openMenuOn('Crunch');
    expect(menu).toHaveTextContent('clip: 1A');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^PASTE/ }));
    const options = screen.getByRole('dialog', { name: 'Paste options' });
    expect(within(options).getByRole('radio', { name: /OVERWRITE/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(options).getByRole('button', { name: 'OK' }));
    expect(props.onPasteToSlot).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows the actions that are not built yet greyed out, and they do nothing', () => {
    const { props } = renderSheet({ clipboardLabel: '1A' });
    const menu = openMenuOn('Crunch');
    for (const name of ['UNDO', 'REDO', 'CUT', 'RESET', /^INSERT/]) {
      const item = within(menu).getByRole('menuitem', { name });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(item);
    }
    expect(props.onPasteToSlot).not.toHaveBeenCalled();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^PASTE/ }));
    const options = screen.getByRole('dialog', { name: 'Paste options' });
    expect(within(options).getByRole('radio', { name: /INSERT/ })).toHaveAttribute('aria-disabled', 'true');
    expect(within(options).getByRole('radio', { name: /SWAP/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('Escape closes the menu without closing the Patch Manager', () => {
    const { props } = renderSheet();
    openMenuOn('Crunch');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('Escape in the paste options steps back to the menu', () => {
    renderSheet({ clipboardLabel: '1A' });
    const menu = openMenuOn('Crunch');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^PASTE/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Paste options' })).toBeNull();
    expect(screen.getByRole('menu', { name: 'Patch actions' })).toBeTruthy();
  });

  it('clicking outside closes the menu but not the Patch Manager', () => {
    const { props } = renderSheet();
    openMenuOn('Crunch');
    fireEvent.click(screen.getByTestId('patch-menu-backdrop'));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('says why COPY is unavailable while disconnected', () => {
    renderSheet({ connected: false });
    const menu = openMenuOn('Crunch');
    expect(within(menu).getByRole('menuitem', { name: 'COPY' })).toHaveAttribute('title', 'Connect the GP-200 first');
  });
});
