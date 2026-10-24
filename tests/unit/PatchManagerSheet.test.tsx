import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    expect(screen.getByText('active: 1A')).toBeTruthy();
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
    expect(screen.getByText(/WORKING WITH THE PEDAL · 12 of 256/)).toBeTruthy();
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

  it('DOWN keeps the highlight in place when the swap fails', async () => {
    const { props } = renderSheet({ onSwapSlots: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByRole('button', { name: '▼ DOWN' }));
    await vi.waitFor(() => expect(props.onSwapSlots).toHaveBeenCalled());
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '▼ DOWN' })).not.toBeDisabled());
    expect(screen.getByText('Clean').closest('button')).toHaveClass('selected');
  });

  it('DOWN moves the highlight with the patch when the swap succeeds', async () => {
    renderSheet({ onSwapSlots: vi.fn().mockResolvedValue(true) });
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByRole('button', { name: '▼ DOWN' }));
    await vi.waitFor(() => expect(screen.getByText('Crunch').closest('button')).toHaveClass('selected'));
    expect(screen.getByText('Clean').closest('button')).not.toHaveClass('selected');
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
    for (const name of ['UNDO', 'REDO', 'CUT', 'RESET']) {
      const item = within(menu).getByRole('menuitem', { name });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(item);
    }
    expect(props.onPasteToSlot).not.toHaveBeenCalled();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^PASTE/ }));
    const options = screen.getByRole('dialog', { name: 'Paste options' });
    // INSERT was removed (owner, 2026-09-18): shifting the list is minutes of copies.
    expect(within(options).queryByRole('radio', { name: /INSERT/ })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: /^INSERT/ })).toBeNull();
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

describe('PatchManagerSheet: right-click RENAME', () => {
  function openMenuOn(text: string) {
    fireEvent.contextMenu(screen.getByText(text), { clientX: 120, clientY: 140 });
    return screen.getByRole('menu', { name: 'Patch actions' });
  }

  it('opens the same inline rename as the RENAME button, for the right-clicked slot', async () => {
    const { props } = renderSheet();
    const menu = openMenuOn('Crunch');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'RENAME' }));
    expect(screen.queryByRole('menu')).toBeNull();
    const input = screen.getByDisplayValue('Crunch');
    fireEvent.change(input, { target: { value: 'Lead Boost' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await vi.waitFor(() => {
      expect(props.onRenameSlot).toHaveBeenCalledWith(1, 'Lead Boost');
    });
  });

  it('renames one patch at a time, and says so', () => {
    renderSheet();
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByText('Crunch'), { shiftKey: true });
    const rename = within(openMenuOn('Crunch')).getByRole('menuitem', { name: 'RENAME' });
    expect(rename).toHaveAttribute('aria-disabled', 'true');
    expect(rename).toHaveAttribute('title', 'Rename works on one patch at a time');
  });
});

describe('PatchManagerSheet: default patch and RESET', () => {
  function openMenuOn(text: string) {
    fireEvent.contextMenu(screen.getByText(text), { clientX: 120, clientY: 140 });
    return screen.getByRole('menu', { name: 'Patch actions' });
  }

  it('SET AS DEFAULT PATCH hands the right-clicked slot over', () => {
    const onSetDefaultPatch = vi.fn().mockResolvedValue(undefined);
    renderSheet({ onSetDefaultPatch, onResetSlot: vi.fn().mockResolvedValue(undefined) });
    const menu = openMenuOn('Crunch');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'SET AS DEFAULT PATCH' }));
    expect(onSetDefaultPatch).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('RESET explains how to set a default when there is none', () => {
    renderSheet({ onSetDefaultPatch: vi.fn(), onResetSlot: vi.fn(), defaultPatchLabel: null });
    const reset = within(openMenuOn('Crunch')).getByRole('menuitem', { name: 'RESET' });
    expect(reset).toHaveAttribute('aria-disabled', 'true');
    expect(reset.getAttribute('title')).toContain('SET AS DEFAULT PATCH');
  });

  it('RESET asks first, naming the default slot and the reset name, then resets', () => {
    const onResetSlot = vi.fn().mockResolvedValue(undefined);
    renderSheet({ onSetDefaultPatch: vi.fn(), onResetSlot, defaultPatchLabel: '1A' });
    const menu = openMenuOn('Crunch');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'RESET' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Confirm reset' });
    expect(confirm).toHaveTextContent('Reset 1B to your default patch (from 1A)');
    expect(confirm).toHaveTextContent('Itza GP-200');
    expect(onResetSlot).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Reset' }));
    expect(onResetSlot).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Cancel and Escape both step back from the confirmation without resetting', () => {
    const onResetSlot = vi.fn();
    renderSheet({ onSetDefaultPatch: vi.fn(), onResetSlot, defaultPatchLabel: '1A' });
    const menu = openMenuOn('Crunch');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'RESET' }));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Confirm reset' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog', { name: 'Confirm reset' })).toBeNull();
    fireEvent.click(within(screen.getByRole('menu', { name: 'Patch actions' })).getByRole('menuitem', { name: 'RESET' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog', { name: 'Confirm reset' })).toBeNull();
    expect(screen.getByRole('menu', { name: 'Patch actions' })).toBeTruthy();
    expect(onResetSlot).not.toHaveBeenCalled();
  });

  it('will not reset the default patch onto itself', () => {
    renderSheet({ onSetDefaultPatch: vi.fn(), onResetSlot: vi.fn(), defaultPatchLabel: '1B' });
    const reset = within(openMenuOn('Crunch')).getByRole('menuitem', { name: 'RESET' });
    expect(reset).toHaveAttribute('aria-disabled', 'true');
    expect(reset).toHaveAttribute('title', 'We can’t reset the default patch');
  });

  it('greys SET AS DEFAULT PATCH on the patch that already is the default', () => {
    renderSheet({ onSetDefaultPatch: vi.fn(), onResetSlot: vi.fn(), defaultPatchLabel: '1B' });
    const setDefault = within(openMenuOn('Crunch')).getByRole('menuitem', { name: 'SET AS DEFAULT PATCH' });
    expect(setDefault).toHaveAttribute('aria-disabled', 'true');
    expect(setDefault).toHaveAttribute('title', 'Already set as default patch');
  });
});

describe('PatchManagerSheet: swap slot and PASTE ▸ SWAP', () => {
  function openMenuOn(text: string) {
    fireEvent.contextMenu(screen.getByText(text), { clientX: 120, clientY: 140 });
    return screen.getByRole('menu', { name: 'Patch actions' });
  }
  const swapHosts = () => ({
    onSetSwapSlot: vi.fn().mockResolvedValue(undefined),
    onSwapWithClipboard: vi.fn().mockResolvedValue(undefined),
  });

  it('USE FOR SWAP SLOT warns that swaps overwrite the slot, then sets it', () => {
    const hosts = swapHosts();
    renderSheet(hosts);
    fireEvent.click(within(openMenuOn('Crunch')).getByRole('menuitem', { name: 'USE FOR SWAP SLOT' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Confirm swap slot' });
    expect(confirm).toHaveTextContent('overwritten by every swap');
    expect(hosts.onSetSwapSlot).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Use for swap slot' }));
    expect(hosts.onSetSwapSlot).toHaveBeenCalledWith(1);
  });

  it('keeps the swap slot and the default patch apart', () => {
    renderSheet({ ...swapHosts(), onSetDefaultPatch: vi.fn(), defaultPatchLabel: '1B', swapSlotLabel: '1A' });
    const onDefault = within(openMenuOn('Crunch')).getByRole('menuitem', { name: 'USE FOR SWAP SLOT' });
    expect(onDefault).toHaveAttribute('title', 'Cannot use Default as Swap Slot');
    fireEvent.keyDown(document, { key: 'Escape' });
    const onSwapSlot = within(openMenuOn('Clean')).getByRole('menuitem', { name: 'SET AS DEFAULT PATCH' });
    expect(onSwapSlot).toHaveAttribute('title', 'Swap Slot cannot be the Default Patch');
  });

  it('tags the swap slot in the list and flags it at the top of its menu', () => {
    renderSheet({ ...swapHosts(), swapSlotLabel: '1B' });
    const row = screen.getByText('Crunch').closest('button')!;
    expect(within(row).getByText('SWAP SLOT')).toBeTruthy();
    expect(within(screen.getByText('Clean').closest('button')!).queryByText('SWAP SLOT')).toBeNull();
    expect(openMenuOn('Crunch')).toHaveTextContent(/^In Use for Swap Slot/);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(openMenuOn('Clean')).not.toHaveTextContent('In Use for Swap Slot');
  });

  it('PASTE ▸ SWAP explains how to set a swap slot when there is none', () => {
    renderSheet({ ...swapHosts(), clipboardLabel: '1A' });
    fireEvent.click(within(openMenuOn('Crunch')).getByRole('menuitem', { name: /^PASTE/ }));
    const swap = within(screen.getByRole('dialog', { name: 'Paste options' })).getByRole('radio', { name: /SWAP/ });
    expect(swap).toHaveAttribute('aria-disabled', 'true');
    expect(swap.getAttribute('title')).toContain('USE FOR SWAP SLOT');
  });

  it('PASTE ▸ SWAP swaps with the clipboard instead of overwriting', () => {
    const hosts = swapHosts();
    const { props } = renderSheet({ ...hosts, clipboardLabel: '1A', swapSlotLabel: '64D' });
    fireEvent.click(within(openMenuOn('Crunch')).getByRole('menuitem', { name: /^PASTE/ }));
    const options = screen.getByRole('dialog', { name: 'Paste options' });
    const swap = within(options).getByRole('radio', { name: /SWAP/ });
    expect(swap).toHaveTextContent('copies through 64D');
    fireEvent.click(swap);
    expect(swap).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(options).getByRole('button', { name: 'OK' }));
    expect(hosts.onSwapWithClipboard).toHaveBeenCalledWith(1);
    expect(props.onPasteToSlot).not.toHaveBeenCalled();
  });

  it('OVERWRITE stays the default paste method', () => {
    const hosts = swapHosts();
    const { props } = renderSheet({ ...hosts, clipboardLabel: '1A', swapSlotLabel: '64D' });
    fireEvent.click(within(openMenuOn('Crunch')).getByRole('menuitem', { name: /^PASTE/ }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Paste options' })).getByRole('button', { name: 'OK' }));
    expect(props.onPasteToSlot).toHaveBeenCalledWith(1);
    expect(hosts.onSwapWithClipboard).not.toHaveBeenCalled();
  });

  it('will not swap the swap slot itself, or a patch onto its own slot', () => {
    renderSheet({ ...swapHosts(), clipboardLabel: '1B', swapSlotLabel: '64D' });
    fireEvent.click(within(openMenuOn('Crunch')).getByRole('menuitem', { name: /^PASTE/ }));
    const swap = within(screen.getByRole('dialog', { name: 'Paste options' })).getByRole('radio', { name: /SWAP/ });
    expect(swap).toHaveAttribute('title', 'The copied patch is already here');
  });
});

describe('PatchManagerSheet: multi-slot COPY and PASTE', () => {
  function openMenuOn(text: string, init?: MouseEventInit) {
    fireEvent.contextMenu(screen.getByText(text), { clientX: 120, clientY: 140, ...init });
    return screen.getByRole('menu', { name: 'Patch actions' });
  }

  it('COPY with two patches selected copies both, named as a range', () => {
    const onCopySlots = vi.fn().mockResolvedValue(undefined);
    renderSheet({ onCopySlots });
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByText('Crunch'), { shiftKey: true });
    fireEvent.click(within(openMenuOn('Crunch')).getByRole('menuitem', { name: 'COPY' }));
    expect(onCopySlots).toHaveBeenCalledWith([0, 1], '1A–1B');
  });

  it('keeps COPY to one patch when the host has no multi-copy', () => {
    renderSheet();
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByText('Crunch'), { shiftKey: true });
    expect(within(openMenuOn('Crunch')).getByRole('menuitem', { name: 'COPY' }))
      .toHaveAttribute('title', 'Copy works on one patch at a time for now');
  });

  it('PASTE of several patches names the slots it will overwrite', () => {
    const { props } = renderSheet({ clipboardLabel: '63A–63B', clipboardSlots: [248, 249] });
    const menu = openMenuOn('Clean');
    expect(menu).toHaveTextContent('clip: 63A–63B · 2 patches');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^PASTE/ }));
    const panel = screen.getByRole('dialog', { name: 'Paste options' });
    expect(panel).toHaveTextContent('Paste 2 patches starting at 1A');
    expect(panel).toHaveTextContent('Replaces 1A–1B with 63A–63B');
    expect(within(panel).getByRole('radio', { name: /SWAP/ })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(within(panel).getByRole('button', { name: 'OK' }));
    expect(props.onPasteToSlot).toHaveBeenCalledWith(0);
  });

  it('refuses a paste that would overwrite the copied patches or run past 64D', () => {
    renderSheet({ clipboardLabel: '1A–1B', clipboardSlots: [0, 1] });
    expect(within(openMenuOn('Crunch')).getByRole('menuitem', { name: /^PASTE/ }).getAttribute('title'))
      .toContain('would overwrite the copied patches');
    fireEvent.keyDown(document, { key: 'Escape' });
    // 63A with 10 copied patches would need 63A–65B.
    cleanup();
    renderSheet({ clipboardLabel: '1A, 1B +8', clipboardSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
    expect(within(openMenuOn('American Idiot')).getByRole('menuitem', { name: /^PASTE/ }))
      .toHaveAttribute('title', 'Not enough room: 10 patches from 63A would run past 64D');
  });
});

describe('PatchManagerSheet: PROTECT 64', () => {
  const hosts = () => ({
    onProtectBank64: vi.fn().mockResolvedValue(undefined),
    onReleaseBank64: vi.fn().mockResolvedValue(undefined),
    onSetDefaultPatch: vi.fn(),
    onSetSwapSlot: vi.fn().mockResolvedValue(undefined),
  });

  it('works with no default patch set (it writes the patch shipped with the app)', () => {
    renderSheet(hosts());
    expect(screen.getByRole('button', { name: 'PROTECT 64' })).not.toBeDisabled();
  });

  it('asks first; Cancel changes nothing, OK protects', async () => {
    const h = hosts();
    renderSheet({ ...h, defaultPatchLabel: '1A' });
    fireEvent.click(screen.getByRole('button', { name: 'PROTECT 64' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Confirm protect bank 64' });
    expect(confirm).toHaveTextContent('Are you sure? This will overwrite and protect patch bank 64.');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(h.onProtectBank64).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'PROTECT 64' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(h.onProtectBank64).toHaveBeenCalledTimes(1);
  });

  it('when protected: red RELEASE 64, bank 64 marked, default and swap slot locked', () => {
    const h = hosts();
    renderSheet({ ...h, bank64Protected: true, defaultPatchLabel: '64C', swapSlotLabel: '64D' });
    expect(screen.queryByRole('button', { name: 'PROTECT 64' })).toBeNull();
    expect(screen.getByText('American Idiot').closest('section')).not.toHaveClass('pp-protected');
    fireEvent.contextMenu(screen.getByText('Crunch'), { clientX: 120, clientY: 140 });
    const menu = screen.getByRole('menu', { name: 'Patch actions' });
    expect(within(menu).getByRole('menuitem', { name: 'USE FOR DEFAULT PATCH (64C)' }))
      .not.toHaveAttribute('aria-disabled', 'true');
    expect(within(menu).getByRole('menuitem', { name: 'USE FOR SWAP SLOT' }).getAttribute('title'))
      .toContain('Bank 64 is protected');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'RELEASE 64' }));
    expect(h.onReleaseBank64).toHaveBeenCalledTimes(1);
  });

  it('keeps a multi-patch paste out of the protected bank', () => {
    const presetNames = makeNames();
    presetNames[251] = 'Last Song';
    renderSheet({ ...hosts(), presetNames, bank64Protected: true, clipboardLabel: '1A–1B', clipboardSlots: [0, 1] });
    fireEvent.contextMenu(screen.getByText('Last Song'), { clientX: 120, clientY: 140 });
    expect(within(screen.getByRole('menu', { name: 'Patch actions' })).getByRole('menuitem', { name: /^PASTE/ }))
      .toHaveAttribute('title', 'Not enough room: 2 patches from 63D would run into protected bank 64');
  });
});

describe('PatchPicker: protected bank', () => {
  it('paints the protected bank and labels it', async () => {
    const { PatchPicker } = await import('@/components/PatchPicker');
    const names = makeNames();
    names[252] = 'Itza GP-200';
    render(<PatchPicker presetNames={names} namesLoadProgress={256} currentSlot={null} selected={null}
      onSelect={vi.fn()} protectedBank={64} />);
    const section = screen.getByText('Itza GP-200').closest('section')!;
    expect(section).toHaveClass('pp-protected');
    expect(section).toHaveTextContent('BANK 64 · PROTECTED');
    expect(screen.getByText('American Idiot').closest('section')).not.toHaveClass('pp-protected');
  });
});

describe('PatchManagerSheet: protected bank 64 rules', () => {
  function namesWithBank64() {
    const names = makeNames();
    names[251] = 'Last Song';
    names[252] = 'UTILITY-1';
    names[253] = 'UTILITY-2';
    names[254] = 'ITZA GP-200';
    names[255] = 'SWAP SLOT';
    return names;
  }
  const protectedHosts = () => ({
    presetNames: namesWithBank64(),
    bank64Protected: true,
    onProtectBank64: vi.fn().mockResolvedValue(undefined),
    onReleaseBank64: vi.fn().mockResolvedValue(undefined),
    onResetSlot: vi.fn().mockResolvedValue(undefined),
    onSetDefaultPatch: vi.fn(),
    onSwapWithClipboard: vi.fn().mockResolvedValue(undefined),
    defaultPatchLabel: '64C',
    swapSlotLabel: '64D',
  });
  const menuOn = (text: string) => {
    fireEvent.contextMenu(screen.getByText(text), { clientX: 120, clientY: 140 });
    return screen.getByRole('menu', { name: 'Patch actions' });
  };

  it('fixes the names of 64A–64D', () => {
    renderSheet(protectedHosts());
    expect(within(menuOn('UTILITY-1')).getByRole('menuitem', { name: 'RENAME' }))
      .toHaveAttribute('title', 'Bank 64 is protected: its names are fixed');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'RENAME' })).toBeDisabled();
  });

  it('keeps swaps out of bank 64, and ▼DOWN from 63D', () => {
    renderSheet(protectedHosts());
    fireEvent.click(screen.getByText('Last Song'));
    expect(screen.getByRole('button', { name: '▼ DOWN' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '▲ UP' })).not.toBeDisabled();
    fireEvent.click(screen.getByText('UTILITY-1'));
    expect(screen.getByRole('button', { name: '▲ UP' })).toBeDisabled();
  });

  it('won’t RESET the swap slot', () => {
    renderSheet(protectedHosts());
    expect(within(menuOn('64D')).getByRole('menuitem', { name: 'RESET' }))
      .toHaveAttribute('title', 'Bank 64 is protected: 64D is the swap slot');
  });

  it('shows the working spinner while an action runs', async () => {
    let finish: () => void = () => {};
    const onCopySlot = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderSheet({ onCopySlot });
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByRole('button', { name: 'COPY' }));
    expect(screen.getByText(/WORKING WITH THE PEDAL/)).toHaveClass('pm-busy-text');
    finish();
    await vi.waitFor(() => expect(screen.queryByText(/WORKING WITH THE PEDAL/)).toBeNull());
  });
});

describe('PatchManagerSheet: USE FOR DEFAULT PATCH (64C)', () => {
  it('asks first, then copies the selected patch into 64C', () => {
    const onSetDefaultPatch = vi.fn().mockResolvedValue(undefined);
    renderSheet({ bank64Protected: true, onSetDefaultPatch, defaultPatchLabel: '64C', swapSlotLabel: '64D' });
    fireEvent.contextMenu(screen.getByText('Crunch'), { clientX: 120, clientY: 140 });
    const menu = screen.getByRole('menu', { name: 'Patch actions' });
    expect(within(menu).queryByRole('menuitem', { name: 'SET AS DEFAULT PATCH' })).toBeNull();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'USE FOR DEFAULT PATCH (64C)' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Confirm default patch' });
    expect(confirm).toHaveTextContent('Copy 1B’s settings into 64C as the default patch? 64C’s current settings are overwritten.');
    expect(onSetDefaultPatch).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Use for default' }));
    expect(onSetDefaultPatch).toHaveBeenCalledWith(1);
  });

  it('keeps the old label and no confirm when bank 64 isn’t protected', () => {
    const onSetDefaultPatch = vi.fn().mockResolvedValue(undefined);
    renderSheet({ onSetDefaultPatch });
    fireEvent.contextMenu(screen.getByText('Crunch'), { clientX: 120, clientY: 140 });
    fireEvent.click(within(screen.getByRole('menu', { name: 'Patch actions' })).getByRole('menuitem', { name: 'SET AS DEFAULT PATCH' }));
    expect(onSetDefaultPatch).toHaveBeenCalledWith(1);
  });
});

describe('PatchManagerSheet: SAVE / RESTORE 64', () => {
  const bankNames = (c = 'ITZA GP-200') => {
    const names = makeNames();
    names[252] = 'UTILITY-1';
    names[253] = 'UTILITY-2';
    names[254] = c;
    names[255] = 'SWAP SLOT';
    return names;
  };
  const hosts = () => ({
    onSaveBank64: vi.fn().mockResolvedValue(undefined),
    onRestoreBank64: vi.fn().mockResolvedValue(undefined),
    onProtectBank64: vi.fn().mockResolvedValue(undefined),
    onReleaseBank64: vi.fn().mockResolvedValue(undefined),
  });

  it('offers SAVE 64 only while bank 64 is protected', () => {
    const h = hosts();
    renderSheet({ ...h, presetNames: bankNames() });
    expect(screen.queryByRole('button', { name: 'SAVE 64' })).toBeNull();
    cleanup();
    renderSheet({ ...h, presetNames: bankNames(), bank64Protected: true });
    fireEvent.click(screen.getByRole('button', { name: 'SAVE 64' }));
    expect(h.onSaveBank64).toHaveBeenCalledTimes(1);
  });

  it('RESTORE 64 asks where from; LAST SAVE needs a save in this browser', () => {
    const h = hosts();
    renderSheet({ ...h, presetNames: bankNames() });
    fireEvent.click(screen.getByRole('button', { name: 'RESTORE 64' }));
    const chooser = screen.getByRole('alertdialog', { name: 'Restore bank 64' });
    expect(chooser).toHaveTextContent('This overwrites bank 64 on the pedal.');
    expect(within(chooser).getByRole('button', { name: 'LAST SAVE' })).toBeDisabled();
    fireEvent.click(within(chooser).getByRole('button', { name: 'Cancel' }));
    expect(h.onRestoreBank64).not.toHaveBeenCalled();
    cleanup();
    renderSheet({ ...h, presetNames: bankNames(), bank64SavedAt: '2026-09-18T12:00:00.000Z' });
    fireEvent.click(screen.getByRole('button', { name: 'RESTORE 64' }));
    fireEvent.click(screen.getByRole('button', { name: /^LAST SAVE \(/ }));
    expect(h.onRestoreBank64).toHaveBeenCalledWith('browser');
  });

  it('restores from a chosen file', async () => {
    const h = hosts();
    renderSheet({ ...h, presetNames: bankNames() });
    fireEvent.click(screen.getByRole('button', { name: 'RESTORE 64' }));
    const file = new File(['{"format":"gp200-bank64"}'], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('restore-file-input'), { target: { files: [file] } });
    await vi.waitFor(() => expect(h.onRestoreBank64).toHaveBeenCalledWith({ text: '{"format":"gp200-bank64"}' }));
  });

  it('warns when protected bank 64 changed on the pedal, with RESTORE 64 at hand', () => {
    renderSheet({ ...hosts(), presetNames: bankNames('Mr. Brown'), bank64Protected: true });
    const warning = screen.getByText(/Bank 64 changed on the pedal/).closest('[role="alert"]')!;
    expect(warning).toHaveTextContent('64C is now “Mr. Brown”');
    fireEvent.click(within(warning as HTMLElement).getByRole('button', { name: 'RESTORE 64' }));
    expect(screen.getByRole('alertdialog', { name: 'Restore bank 64' })).toBeTruthy();
  });

  it('no warning when bank 64 matches, or when it isn’t protected', () => {
    renderSheet({ ...hosts(), presetNames: bankNames(), bank64Protected: true });
    expect(screen.queryByText(/Bank 64 changed on the pedal/)).toBeNull();
    cleanup();
    renderSheet({ ...hosts(), presetNames: bankNames('Mr. Brown') });
    expect(screen.queryByText(/Bank 64 changed on the pedal/)).toBeNull();
  });
});

describe('PatchManagerSheet: paste options on double-click', () => {
  it('a double-click runs the option, like selecting it and pressing OK', () => {
    const { props } = renderSheet({ clipboardLabel: '1A' });
    fireEvent.contextMenu(screen.getByText('Crunch'), { clientX: 120, clientY: 140 });
    fireEvent.click(within(screen.getByRole('menu', { name: 'Patch actions' })).getByRole('menuitem', { name: /^PASTE/ }));
    const overwrite = within(screen.getByRole('dialog', { name: 'Paste options' })).getByRole('radio', { name: /OVERWRITE/ });
    fireEvent.click(overwrite);
    expect(props.onPasteToSlot).not.toHaveBeenCalled();
    fireEvent.doubleClick(overwrite);
    expect(props.onPasteToSlot).toHaveBeenCalledWith(1);
  });

  it('a double-click on a greyed option does nothing', () => {
    const onSwapWithClipboard = vi.fn().mockResolvedValue(undefined);
    renderSheet({ clipboardLabel: '1A', onSwapWithClipboard });
    fireEvent.contextMenu(screen.getByText('Crunch'), { clientX: 120, clientY: 140 });
    fireEvent.click(within(screen.getByRole('menu', { name: 'Patch actions' })).getByRole('menuitem', { name: /^PASTE/ }));
    fireEvent.doubleClick(within(screen.getByRole('dialog', { name: 'Paste options' })).getByRole('radio', { name: /SWAP/ }));
    expect(onSwapWithClipboard).not.toHaveBeenCalled();
  });
});

describe('PatchManagerSheet: SAVE and REFRESH buttons', () => {
  it('SAVE ALL asks first, then writes every setting into the pedal’s current slot', () => {
    const onSaveEditorToPedal = vi.fn().mockResolvedValue(undefined);
    renderSheet({ onSaveEditorToPedal, editorPatchName: 'MAMA 1A', currentSlot: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'SAVE ALL' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Confirm save to pedal' });
    expect(confirm).toHaveTextContent('Write every setting of the editor’s patch “MAMA 1A” into 1B and check it?');
    expect(onSaveEditorToPedal).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Save all' }));
    expect(onSaveEditorToPedal).toHaveBeenCalledWith(1);
  });

  it('RELOAD ALL sits in the button row (not the header) and re-reads the names', () => {
    const { props } = renderSheet();
    const buttons = screen.getAllByRole('button', { name: 'RELOAD ALL' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(props.onRefreshNames).toHaveBeenCalledTimes(1);
  });

  it('WRITE TEST is gone', () => {
    renderSheet();
    expect(screen.queryByRole('button', { name: 'WRITE TEST' })).toBeNull();
  });
});

describe('PatchManagerSheet: CUT', () => {
  const menuOn = (text: string) => {
    fireEvent.contextMenu(screen.getByText(text), { clientX: 120, clientY: 140 });
    return screen.getByRole('menu', { name: 'Patch actions' });
  };

  it('cuts one patch, and says "cut" on the clip line', () => {
    const onCutSlot = vi.fn().mockResolvedValue(undefined);
    renderSheet({ onCutSlot, defaultPatchLabel: '63A' });
    fireEvent.click(within(menuOn('Crunch')).getByRole('menuitem', { name: 'CUT' }));
    expect(onCutSlot).toHaveBeenCalledWith(1);
    cleanup();
    renderSheet({ onCutSlot, defaultPatchLabel: '63A', clipboardLabel: '1B', clipboardSlots: [1], clipboardIsCut: true });
    expect(menuOn('Clean')).toHaveTextContent('cut: 1B · 1 patch');
  });

  it('needs a default patch, one slot, and not the default itself', () => {
    const onCutSlot = vi.fn().mockResolvedValue(undefined);
    renderSheet({ onCutSlot });
    expect(within(menuOn('Crunch')).getByRole('menuitem', { name: 'CUT' }).getAttribute('title'))
      .toContain('Set a default patch first');
    cleanup();
    renderSheet({ onCutSlot, defaultPatchLabel: '1B' });
    expect(within(menuOn('Crunch')).getByRole('menuitem', { name: 'CUT' }))
      .toHaveAttribute('title', 'We can’t cut the default patch');
  });

  it('won’t paste a cut patch back onto itself', () => {
    renderSheet({ onCutSlot: vi.fn(), defaultPatchLabel: '63A', clipboardLabel: '1B', clipboardSlots: [1], clipboardIsCut: true });
    expect(within(menuOn('Crunch')).getByRole('menuitem', { name: /^PASTE/ }))
      .toHaveAttribute('title', 'The cut patch is already here');
  });
});

describe('PatchManagerSheet: UNDO / REDO', () => {
  const menuOn = (text: string) => {
    fireEvent.contextMenu(screen.getByText(text), { clientX: 120, clientY: 140 });
    return screen.getByRole('menu', { name: 'Patch actions' });
  };

  it('greys them when there is nothing to undo or redo', () => {
    renderSheet({ onUndo: vi.fn(), onRedo: vi.fn() });
    const menu = menuOn('Crunch');
    expect(within(menu).getByRole('menuitem', { name: 'UNDO' })).toHaveAttribute('title', 'Nothing to undo');
    expect(within(menu).getByRole('menuitem', { name: 'REDO' })).toHaveAttribute('title', 'Nothing to redo');
  });

  it('names what they would reverse, and runs them', () => {
    const onUndo = vi.fn().mockResolvedValue(undefined);
    const onRedo = vi.fn().mockResolvedValue(undefined);
    renderSheet({ onUndo, onRedo, undoLabel: 'Paste into 61A–61D', redoLabel: 'Swap 1A and 1B' });
    const menu = menuOn('Crunch');
    expect(within(menu).getByRole('menuitem', { name: 'UNDO' })).toHaveAttribute('title', 'Undo: Paste into 61A–61D (Ctrl+Z)');
    expect(within(menu).getByRole('menuitem', { name: 'REDO' })).toHaveAttribute('title', 'Redo: Swap 1A and 1B (Ctrl+Y)');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'UNDO' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

describe('PatchManagerSheet: importing files', () => {
  const prst = () => new File([new Uint8Array([1, 2, 3])], 'My Tone.prst');

  it('FILE > IMPORT .PRST loads into the editor, then asks before saving it into the pedal’s slot', async () => {
    const onImportFile = vi.fn();
    const onImportToSlot = vi.fn().mockResolvedValue(undefined);
    const { container } = renderSheet({ onImportFile, onImportToSlot, currentSlot: 1 });
    const input = container.ownerDocument.querySelector<HTMLInputElement>('input[type="file"][accept=".prst"]')!;
    fireEvent.change(input, { target: { files: [prst()] } });
    const ask = await screen.findByRole('alertdialog', { name: 'Save import to pedal' });
    expect(onImportFile).toHaveBeenCalledTimes(1);
    expect(ask).toHaveTextContent('“My Tone” is in the editor. Also save it into 1B on the pedal? It replaces “Crunch”.');
    expect(onImportToSlot).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole('button', { name: 'Save to 1B' }));
    expect(onImportToSlot).toHaveBeenCalledWith(1, expect.any(Uint8Array));
  });

  it('“Editor only” leaves the pedal alone', async () => {
    const onImportToSlot = vi.fn();
    const { container } = renderSheet({ onImportToSlot, currentSlot: 1 });
    const input = container.ownerDocument.querySelector<HTMLInputElement>('input[type="file"][accept=".prst"]')!;
    fireEvent.change(input, { target: { files: [prst()] } });
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Save import to pedal' }))
      .getByRole('button', { name: 'Editor only' }));
    expect(onImportToSlot).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog', { name: 'Save import to pedal' })).toBeNull();
  });
});

describe('PatchManagerSheet: SAVE PATCH', () => {
  it('commits straight away to the NOW slot, no confirm', () => {
    const onSavePatch = vi.fn().mockResolvedValue(undefined);
    renderSheet({ onSavePatch, editorPatchName: 'MAMA 1A', currentSlot: 1 });
    const button = screen.getByRole('button', { name: 'SAVE PATCH' });
    expect(button.getAttribute('title')).toContain('into 1B');
    fireEvent.click(button);
    expect(onSavePatch).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('PatchManagerSheet: right-click SWAP of two selected patches', () => {
  const menu = () => screen.getByRole('menu', { name: 'Patch actions' });

  it('appears above COPY only when exactly two patches are selected, and swaps them', () => {
    const { props } = renderSheet({ swapSlotLabel: '63A' });
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.contextMenu(screen.getByText('Clean'), { clientX: 120, clientY: 140 });
    expect(within(menu()).queryByRole('menuitem', { name: 'SWAP' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByText('Crunch'), { shiftKey: true });
    fireEvent.contextMenu(screen.getByText('Crunch'), { clientX: 120, clientY: 140 });
    const items = within(menu()).getAllByRole('menuitem').map((item) => item.textContent);
    expect(items.indexOf('SWAP')).toBe(items.indexOf('COPY') - 1);
    fireEvent.click(within(menu()).getByRole('menuitem', { name: 'SWAP' }));
    expect(props.onSwapSlots).toHaveBeenCalledWith(0, 1);
  });

  it('is greyed with the reason when there is no swap slot', () => {
    renderSheet();
    fireEvent.click(screen.getByText('Clean'));
    fireEvent.click(screen.getByText('Crunch'), { shiftKey: true });
    fireEvent.contextMenu(screen.getByText('Crunch'), { clientX: 120, clientY: 140 });
    expect(within(menu()).getByRole('menuitem', { name: 'SWAP' }).getAttribute('title')).toContain('Set a swap slot first');
  });
});

describe('PatchManagerSheet: Ctrl+Z / Ctrl+Y', () => {
  it('Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo', async () => {
    const onUndo = vi.fn().mockResolvedValue(undefined);
    const onRedo = vi.fn().mockResolvedValue(undefined);
    renderSheet({ onUndo, onRedo, undoLabel: 'Paste into 2A', redoLabel: 'Swap 1A and 1B' });
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
    // While that runs the panel is busy, so a key pressed now is ignored.
    fireEvent.keyDown(document, { key: 'y', ctrlKey: true });
    expect(onRedo).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(screen.queryByText(/WORKING WITH THE PEDAL/)).toBeNull());
    fireEvent.keyDown(document, { key: 'y', ctrlKey: true });
    expect(onRedo).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(screen.queryByText(/WORKING WITH THE PEDAL/)).toBeNull());
    fireEvent.keyDown(document, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(onRedo).toHaveBeenCalledTimes(2);
  });

  it('leaves text boxes alone, and does nothing with nothing to undo', () => {
    const onUndo = vi.fn().mockResolvedValue(undefined);
    renderSheet({ onUndo, undoLabel: 'Paste into 2A' });
    fireEvent.keyDown(screen.getByPlaceholderText(/Search patches/), { key: 'z', ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
    cleanup();
    const idle = vi.fn();
    renderSheet({ onUndo: idle, undoLabel: null });
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    expect(idle).not.toHaveBeenCalled();
  });

  it('only while the slide-out is open', () => {
    const onUndo = vi.fn().mockResolvedValue(undefined);
    renderSheet({ open: false, onUndo, undoLabel: 'Paste into 2A' });
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
  });
});

describe('PatchPicker: the pedal’s current patch', () => {
  it('is tagged ACTIVE', async () => {
    const { PatchPicker } = await import('@/components/PatchPicker');
    render(<PatchPicker presetNames={makeNames()} namesLoadProgress={256} currentSlot={1} selected={null} onSelect={vi.fn()} />);
    const row = screen.getByText('Crunch').closest('button')!;
    expect(within(row).getByText('ACTIVE')).toBeTruthy();
    expect(screen.queryByText('NOW')).toBeNull();
  });
});

describe('PatchManagerSheet: showing that the pedal is busy', () => {
  it('names the job and its progress in a banner, and freezes the list', () => {
    const { container } = renderSheet({ bulkProgress: { done: 2, total: 4, label: 'PROTECT 64' } });
    const banner = container.querySelector('.pm-busy')!;
    expect(banner).toHaveTextContent('PROTECT 64 · 2 of 4');
    expect(banner).toHaveTextContent('leave the pedal alone');
    expect(container.querySelector('.pm-dim')).not.toBeNull();
  });

  it('falls back to a general message when the job has no name', () => {
    const { container } = renderSheet({ bulkProgress: { done: 1, total: 3 } });
    expect(container.querySelector('.pm-busy')).toHaveTextContent('WORKING WITH THE PEDAL · 1 of 3');
  });

  it('no banner, and the list is live, when nothing is running', () => {
    const { container } = renderSheet();
    expect(screen.queryByText(/WORKING WITH THE PEDAL/)).toBeNull();
    expect(container.querySelector('.pm-dim')).toBeNull();
  });

  it('refuses slot actions while the names are being read', () => {
    renderSheet({ namesScanning: true, onResetSlot: vi.fn(), defaultPatchLabel: '63A' });
    fireEvent.contextMenu(screen.getByText('Crunch'), { clientX: 120, clientY: 140 });
    const menu = screen.getByRole('menu', { name: 'Patch actions' });
    for (const name of ['COPY', 'RESET']) {
      expect(within(menu).getByRole('menuitem', { name }))
        .toHaveAttribute('title', 'Wait for the patch names to finish loading');
    }
  });
});
