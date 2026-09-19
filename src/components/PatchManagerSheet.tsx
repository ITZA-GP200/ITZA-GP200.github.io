import { useRef, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { PatchPicker } from './PatchPicker';
import { PatchContextMenu } from './PatchContextMenu';
import { DEFAULT_PATCH_NAME } from '@/core/defaultPatch';
import { describeRange, pasteProblem } from '@/core/multiPaste';
import { bank64NameChanges } from '@/core/bank64Backup';
import { SysExCodec } from '@/core/SysExCodec';
import {
  EMPTY_SELECTION,
  collapseToAnchor,
  selectAll,
  selectSlot,
  selectedSlots as slotsOf,
  type SlotSelection,
} from '@/core/slotSelection';

export interface BulkExportProgress {
  done: number;
  total: number;
  /** False for jobs that can't stop halfway safely (PROTECT 64): no cancel link. */
  cancellable?: boolean;
}

export interface PatchManagerSheetProps {
  open: boolean;
  onClose: () => void;
  connected: boolean;
  presetNames: (string | null)[];
  namesLoadProgress: number;
  /** True while the background pass is re-verifying cache-seeded names. */
  namesSyncing?: boolean;
  currentSlot: number | null;
  onActivate: (slot: number) => Promise<void>;
  onOpenInEditor: (slot: number) => Promise<void>;
  onExportSlot: (slot: number) => Promise<void>;
  onExportSlots: (slots: number[]) => Promise<void>;
  bulkProgress: BulkExportProgress | null;
  onCancelBulk: () => void;
  onImportToSlot: (slot: number, bytes: Uint8Array) => Promise<void>;
  /** Read a slot into the in-app clipboard. */
  onCopySlot: (slot: number) => Promise<void>;
  /** Copy several slots at once (label names them, e.g. "1A–1D"). Omit to
   *  keep COPY to one slot. */
  onCopySlots?: (slots: number[], label: string) => Promise<void>;
  /** Write the clipboard into a slot. */
  onPasteToSlot: (slot: number) => Promise<void>;
  /** CUT one patch: copied like COPY; PASTE ▸ OVERWRITE then resets it. */
  onCutSlot?: (slot: number) => Promise<void>;
  /** The clipboard holds a CUT patch. */
  clipboardIsCut?: boolean;
  /** What UNDO / REDO would reverse ("Paste into 61A–61D"), or null. */
  undoLabel?: string | null;
  redoLabel?: string | null;
  onUndo?: () => Promise<void>;
  onRedo?: () => Promise<void>;
  /** Exchange the contents of two slots. */
  onSwapSlots: (first: number, second: number) => Promise<boolean | void>;
  /** Label of whatever is on the clipboard, or null when it is empty. */
  clipboardLabel: string | null;
  /** Bank 64 is set aside for the app (PROTECT 64). */
  bank64Protected?: boolean;
  /** PROTECT 64 (after the sheet's confirm). Omit to hide the button. */
  onProtectBank64?: () => Promise<void>;
  /** RELEASE 64: lift the protection only. */
  onReleaseBank64?: () => Promise<void>;
  /** SAVE 64: back up 64A–64C (browser copy + downloaded file). */
  onSaveBank64?: () => Promise<void>;
  /** RESTORE 64 from the last save in this browser, or from a file's text. */
  onRestoreBank64?: (source: 'browser' | { text: string }) => Promise<void>;
  /** When the last SAVE 64 in this browser was made (ISO), or null. */
  bank64SavedAt?: string | null;
  /** SAVE: write the editor's patch into this slot on the pedal (the pedal's
   *  current slot), so the pedal matches the editor. */
  onSaveEditorToPedal?: (slot: number) => Promise<void>;
  /** SAVE PATCH: commit the pedal's edit buffer to this slot (the NOW
   *  slot) under the editor's name, like SAVE on the pedal. Quick. */
  onSavePatch?: (slot: number) => Promise<void>;
  /** The patch in the editor, named in SAVE's confirm. */
  editorPatchName?: string | null;
  /** The copied slots, in paste order (empty when nothing is copied). */
  clipboardSlots?: number[];
  onRenameSlot: (slot: number, name: string) => Promise<void>;
  onRefreshNames: () => void;
  /** Load a .prst into the editor buffer (pushes + saves when connected). */
  onImportFile: (bytes: Uint8Array) => void;
  /** Open the editor's export-preset dialog for the current patch. */
  onExportRequest: () => void;
  /** User-IR slot names enumerated at connect (30 entries; empty offline). */
  userIrNames: string[];
  /** Last slot action failure (copy, paste, …). Shown inside the sheet,
   *  because the app-level error banner sits under this dialog's overlay. */
  errorMessage?: string | null;
  onDismissError?: () => void;
  /** Make a slot the template RESET copies (reads and remembers it). */
  onSetDefaultPatch?: (slot: number) => Promise<void>;
  /** Copy the default patch over a slot, saved as DEFAULT_PATCH_NAME. */
  onResetSlot?: (slot: number) => Promise<void>;
  /** Slot holding the default patch ("5B"), or null when none is set. */
  defaultPatchLabel?: string | null;
  /** Make a slot the scratch space swaps copy through. */
  onSetSwapSlot?: (slot: number) => Promise<void>;
  /** Exchange the clipboard's slot with this one (PASTE ▸ SWAP). */
  onSwapWithClipboard?: (slot: number) => Promise<void>;
  /** The swap slot ("64D"), or null when none is set. */
  swapSlotLabel?: string | null;
}

function bankSlotsOf(slot: number): number[] {
  const base = Math.floor(slot / 4) * 4;
  return [base, base + 1, base + 2, base + 3];
}

/** "17D"; "1A–1C" for a contiguous run; otherwise "1A, 2C, 5B" (+N past three). */
function describeSlots(slots: number[]): string {
  if (slots.length === 0) return '';
  const labels = slots.map((slot) => SysExCodec.slotToLabel(slot));
  if (slots.length === 1) return labels[0];
  if (slots[slots.length - 1] - slots[0] === slots.length - 1) {
    return `${labels[0]}–${labels[labels.length - 1]}`;
  }
  if (labels.length <= 3) return labels.join(', ');
  return `${labels.slice(0, 3).join(', ')} +${labels.length - 3}`;
}


/**
 * Right-anchored side sheet listing all 256 device slots (64 banks × A–D)
 * with search, activate, open-in-editor, rename, per-slot .prst export /
 * import, and bulk export (bank / all → single .zip). Also hosts the
 * editor-buffer FILE row (import/export the current patch as .prst), which
 * works without a connected device. The pedalboard stays visible so slot
 * browsing is audible/visible in context.
 */
export function PatchManagerSheet({
  open,
  onClose,
  connected,
  presetNames,
  namesLoadProgress,
  namesSyncing = false,
  currentSlot,
  onActivate,
  onOpenInEditor,
  onExportSlot,
  onExportSlots,
  bulkProgress,
  onCancelBulk,
  onImportToSlot,
  onCopySlot,
  onCopySlots,
  onPasteToSlot,
  onCutSlot,
  clipboardIsCut = false,
  undoLabel = null,
  redoLabel = null,
  onUndo,
  onRedo,
  onSwapSlots,
  clipboardLabel,
  clipboardSlots = [],
  bank64Protected = false,
  onProtectBank64,
  onReleaseBank64,
  onSaveEditorToPedal,
  onSavePatch,
  editorPatchName = null,
  onSaveBank64,
  onRestoreBank64,
  bank64SavedAt = null,
  onRenameSlot,
  onRefreshNames,
  onImportFile,
  onExportRequest,
  userIrNames,
  errorMessage = null,
  onDismissError,
  onSetDefaultPatch,
  onResetSlot,
  defaultPatchLabel = null,
  onSetSwapSlot,
  onSwapWithClipboard,
  swapSlotLabel = null,
}: PatchManagerSheetProps) {
  // Anchor + extras. The anchor is what every single-slot action acts on, so
  // multi-select sits on top of those buttons without changing them.
  const [selection, setSelection] = useState<SlotSelection>(EMPTY_SELECTION);
  const selected = selection.anchor;
  const [irListOpen, setIrListOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmImportSlot, setConfirmImportSlot] = useState<number | null>(null);
  const pendingImportRef = useRef<Uint8Array | null>(null);
  // FILE > IMPORT .PRST: the file just loaded into the editor, waiting on
  // "save it into the pedal's current slot too?"
  const pendingEditorImportRef = useRef<{ bytes: Uint8Array; name: string } | null>(null);
  const [confirmEditorImport, setConfirmEditorImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorFileInputRef = useRef<HTMLInputElement>(null);
  // Where the right-click menu is open, or null.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

  const namesLoading = namesLoadProgress < 256;
  const bulkRunning = bulkProgress !== null;
  const actionsDisabled = !connected || selected === null || busy || bulkRunning;

  let selectedLabel = '';
  if (selected !== null) selectedLabel = SysExCodec.slotToLabel(selected);
  let currentLabel = '-';
  if (currentSlot !== null) currentLabel = SysExCodec.slotToLabel(currentSlot);

  const selectedSlots = slotsOf(selection);
  const [confirmingProtect, setConfirmingProtect] = useState(false);
  const [confirmingSave, setConfirmingSave] = useState(false);
  const [choosingRestore, setChoosingRestore] = useState(false);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  function handleSelect(slot: number, modifiers?: { shift: boolean; toggle: boolean }) {
    setRenaming(false);
    setSelection((prev) => selectSlot(prev, slot, modifiers));
  }

  function selectBank() {
    if (selected === null) return;
    setSelection((prev) => selectAll(prev, bankSlotsOf(selected)));
  }

  function clearSelection() {
    setSelection(collapseToAnchor);
  }

  // Standard context-menu behaviour: right-clicking a row outside the
  // selection selects that row first; inside it, the selection is kept.
  function handleRowContextMenu(slot: number, x: number, y: number) {
    if (!selectedSlots.includes(slot)) handleSelect(slot);
    setMenuAt({ x, y });
  }

  // Why each menu action can't run right now (null when it can). COPY and
  // PASTE act on one slot, like the toolbar buttons they share handlers with.
  let slotActionBlocked: string | null = null;
  if (!connected) slotActionBlocked = 'Connect the GP-200 first';
  else if (busy || bulkRunning) slotActionBlocked = 'Wait for the current action to finish';
  let copyBlocked = slotActionBlocked;
  if (!copyBlocked && selectedSlots.length !== 1 && !onCopySlots) copyBlocked = 'Copy works on one patch at a time for now';
  let pasteBlocked = slotActionBlocked;
  if (!pasteBlocked && selectedSlots.length !== 1) pasteBlocked = 'Select a single slot to paste into';
  if (!pasteBlocked && selected !== null && clipboardSlots.length > 0) {
    pasteBlocked = pasteProblem(clipboardSlots, selected, bank64Protected);
  }
  if (!pasteBlocked && clipboardIsCut && selected !== null && clipboardSlots[0] === selected) {
    pasteBlocked = 'The cut patch is already here';
  }
  const clipboardCount = clipboardSlots.length || (clipboardLabel === null ? 0 : 1);
  let renameBlocked = slotActionBlocked;
  if (!renameBlocked && selectedSlots.length !== 1) renameBlocked = 'Rename works on one patch at a time';
  // Protected bank 64: names are fixed, 64D is only ever the swap slot, and
  // swaps can't carry patches (and their names) in or out of the bank.
  const inBank64 = (slot: number) => bank64Protected && slot >= 252;
  const BANK64_NAMES_FIXED = 'Bank 64 is protected: its names are fixed';
  const BANK64_NO_SWAPS = 'Bank 64 is protected: swaps can’t move patches in or out of it';
  if (!renameBlocked && selected !== null && inBank64(selected)) renameBlocked = BANK64_NAMES_FIXED;
  const toolbarSwapBlocked = selectedSlots.some(inBank64) ? BANK64_NO_SWAPS : null;
  const upBlocked = selected !== null && (inBank64(selected) || inBank64(selected - 1)) ? BANK64_NO_SWAPS : null;
  const downBlocked = selected !== null && (inBank64(selected) || inBank64(selected + 1)) ? BANK64_NO_SWAPS : null;
  // Hosts that don't pass the handlers keep these greyed out as not built.
  let setDefaultBlocked = onSetDefaultPatch ? slotActionBlocked : 'Not built yet';
  if (!setDefaultBlocked && selectedSlots.length !== 1) setDefaultBlocked = 'Pick one patch as the default';
  // The template and the scratch slot must differ: a swap would overwrite
  // the template, and every later RESET would refuse.
  if (!setDefaultBlocked && selectedLabel === swapSlotLabel) setDefaultBlocked = 'Swap Slot cannot be the Default Patch';
  if (!setDefaultBlocked && selectedLabel === defaultPatchLabel) setDefaultBlocked = 'Already set as default patch';
  let setSwapSlotBlocked = onSetSwapSlot ? slotActionBlocked : 'Not built yet';
  if (!setSwapSlotBlocked && selectedSlots.length !== 1) setSwapSlotBlocked = 'Pick one slot as the swap slot';
  if (!setSwapSlotBlocked && selectedLabel === defaultPatchLabel) setSwapSlotBlocked = 'Cannot use Default as Swap Slot';
  if (!setSwapSlotBlocked && selectedLabel === swapSlotLabel) setSwapSlotBlocked = 'This is already the swap slot';
  if (!setSwapSlotBlocked && bank64Protected) setSwapSlotBlocked = 'Bank 64 is protected: 64D is the swap slot (RELEASE 64 to change it)';
  // PROTECT 64 writes the patch shipped with the app: no default needed.
  const protectBlocked = slotActionBlocked;
  let swapBlocked = onSwapWithClipboard ? pasteBlocked : 'Not built yet';
  if (!swapBlocked && swapSlotLabel === null) {
    swapBlocked = 'Set a swap slot first: right-click a spare slot, then USE FOR SWAP SLOT';
  }
  if (!swapBlocked && clipboardCount > 1) swapBlocked = 'Swap works with one copied patch';
  if (!swapBlocked && selectedLabel === clipboardLabel) swapBlocked = 'The copied patch is already here';
  if (!swapBlocked && ((selected !== null && inBank64(selected)) || clipboardSlots.some(inBank64))) {
    swapBlocked = BANK64_NO_SWAPS;
  }
  if (!swapBlocked && (selectedLabel === swapSlotLabel || clipboardLabel === swapSlotLabel)) {
    swapBlocked = 'The swap slot can’t take part in a swap';
  }
  // CUT: one patch; the default and swap slots stay put; OVERWRITE resets the
  // source to the default patch, so one must be set.
  let cutBlocked = slotActionBlocked;
  if (!cutBlocked && selectedSlots.length !== 1) cutBlocked = 'Cut works on one patch at a time';
  if (!cutBlocked && selected !== null && inBank64(selected)) cutBlocked = BANK64_NAMES_FIXED;
  if (!cutBlocked && selectedLabel === defaultPatchLabel) cutBlocked = 'We can’t cut the default patch';
  if (!cutBlocked && selectedLabel === swapSlotLabel) cutBlocked = 'The swap slot can’t be cut';
  if (!cutBlocked && defaultPatchLabel === null) {
    cutBlocked = 'Set a default patch first: CUT resets the emptied slot to it';
  }
  let historyBlocked: string | null = null;
  if (!connected) historyBlocked = 'Connect the GP-200 first';
  else if (busy || bulkRunning) historyBlocked = 'Wait for the current action to finish';

  let resetBlocked = onResetSlot ? slotActionBlocked : 'Not built yet';
  if (!resetBlocked && defaultPatchLabel === null) {
    resetBlocked = 'Set a default patch first: right-click a patch, then SET AS DEFAULT PATCH';
  }
  if (!resetBlocked && selectedSlots.length !== 1) resetBlocked = 'Reset works on one patch at a time for now';
  // Resetting the template onto itself would rename it, and every later
  // RESET would then refuse because the default patch "changed".
  if (!resetBlocked && selectedLabel === defaultPatchLabel) resetBlocked = 'We can’t reset the default patch';
  if (!resetBlocked && selected === 255 && bank64Protected) resetBlocked = 'Bank 64 is protected: 64D is the swap slot';
  // Flags the swap slot at the top of the menu: swaps overwrite it.
  // Protected bank 64 renamed or overwritten on the pedal itself.
  const bank64Changes = bank64Protected ? bank64NameChanges(presetNames) : [];
  const selectionIsSwapSlot = selectedSlots.length === 1 && selectedLabel === swapSlotLabel;

  let pasteToolbarTitle = 'Copy a patch first';
  if (clipboardLabel !== null && selected !== null) {
    pasteToolbarTitle = pasteBlocked ?? (clipboardCount > 1
      ? `Overwrite ${describeRange(selected, clipboardCount)} with the ${clipboardCount} copied patches (${clipboardLabel})`
      : `Overwrite ${selectedLabel} with the copied patch (${clipboardLabel})`);
  }

  function copySelection() {
    if (selectedSlots.length > 1 && onCopySlots) {
      void runBusy(() => onCopySlots(selectedSlots, describeSlots(selectedSlots)));
    } else if (selected !== null) {
      void runBusy(() => onCopySlot(selected));
    }
  }

  function handleActivateFromPicker(slot: number) {
    if (connected) void runBusy(() => onActivate(slot));
  }

  async function runBusy(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  function startRename() {
    if (selected === null) return;
    setRenameValue(presetNames[selected] ?? '');
    setRenaming(true);
  }

  async function commitRename() {
    if (selected === null || !renameValue.trim()) {
      setRenaming(false);
      return;
    }
    const name = renameValue.trim().slice(0, 16);
    setRenaming(false);
    await runBusy(() => onRenameSlot(selected, name));
  }

  function handleImportPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || selected === null) return;
    const targetSlot = selected;
    const reader = new FileReader();
    reader.onload = (ev) => {
      pendingImportRef.current = new Uint8Array(ev.target!.result as ArrayBuffer);
      setConfirmImportSlot(targetSlot);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  async function confirmImport() {
    const slot = confirmImportSlot;
    const bytes = pendingImportRef.current;
    setConfirmImportSlot(null);
    pendingImportRef.current = null;
    if (slot === null || !bytes) return;
    await runBusy(() => onImportToSlot(slot, bytes));
  }

  function handleEditorFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const bytes = new Uint8Array(ev.target!.result as ArrayBuffer);
      onImportFile(bytes);
      // Then ask whether the pedal's current slot should get it too.
      if (connected && currentSlot !== null) {
        pendingEditorImportRef.current = { bytes, name: file.name.replace(/\.prst$/i, '') };
        setConfirmEditorImport(true);
      }
      onClose();
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function handleEditorExport() {
    // Close before opening ExportPresetDialog: a stacked Dialog would
    // double-bind the document Escape handler and fight this focus trap.
    onClose();
    onExportRequest();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Patch Manager"
      placement="right"
      maxWidth="max-w-2xl"
      padding="p-0"
      className="flex flex-col"
      closeOnOverlayClick={!busy && !bulkRunning}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-active)' }}
      >
        <span className="font-mono-display font-bold" style={{ color: 'var(--text-primary)' }}>
          PATCHES
        </span>
        <span
          className="font-mono-display text-caption"
          style={{ color: 'var(--text-muted)' }}
        >
          now: {currentLabel}
        </span>
        {namesSyncing && !namesLoading && (
          <span
            className="font-mono-display text-caption"
            style={{ color: 'var(--text-muted)' }}
            title="Verifying cached names against the device"
          >
            syncing…
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto"
          aria-label="Close patch manager"
          style={{ color: 'var(--text-muted)' }}
        >
          ✕
        </button>
      </div>

      {/* Editor-buffer file I/O: works offline, unlike the per-slot actions */}
      <div
        className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-active)' }}
      >
        <span
          className="font-mono-display text-caption"
          style={{ color: 'var(--text-muted)' }}
        >
          FILE
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => editorFileInputRef.current?.click()}
          title="Load a .prst file into the editor, then choose whether to save it into the pedal's current slot"
        >
          IMPORT .PRST
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleEditorExport}
          title="Name and download the editor's current patch as a .prst file"
        >
          EXPORT .PRST
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => window.print()}
          title="Print a rig sheet: this patch, its footswitches, and the slot list"
        >
          PRINT
        </Button>
        <input
          ref={editorFileInputRef}
          type="file"
          accept=".prst"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleEditorFilePick}
        />
      </div>

      {/* User-IR slots, enumerated once per connect. Read-only: the IR
          import/rename/delete write side is pending its protocol decode
          (docs/protocol-capture.md §3). */}
      {connected && userIrNames.length > 0 && (
        <div
          className="px-4 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-active)' }}
        >
          <button
            type="button"
            onClick={() => setIrListOpen(!irListOpen)}
            aria-expanded={irListOpen}
            className="font-mono-display text-caption flex items-center gap-2"
            style={{ color: 'var(--text-muted)' }}
            title="Cabinet impulse responses stored on the device"
          >
            {irListOpen && <span aria-hidden="true">▾</span>}
            {!irListOpen && <span aria-hidden="true">▸</span>}
            USER IRS ({userIrNames.length})
          </button>
          {irListOpen && (
            <ol
              className="mt-2 max-h-40 overflow-y-auto grid grid-cols-2 gap-x-4
                font-mono-display text-caption"
              style={{ color: 'var(--text-secondary)' }}
            >
              {userIrNames.map((irName, slotPosition) => (
                // index IS the identity here: User-IR slots are positional on
                // the device, and duplicate default names are expected
                <li key={slotPosition} className="flex gap-2 py-0.5">
                  <span style={{ color: 'var(--text-muted)' }}>
                    {String(slotPosition + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate">{irName || '—'}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Name-loading progress */}
      {connected && namesLoading && (
        <div className="flex items-center gap-2 px-4 py-1.5 flex-shrink-0">
          <span
            className="font-mono-display shrink-0"
            style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}
          >
            Loading names… {namesLoadProgress}/256
          </span>
          <div
            className="flex-1 h-1 rounded-full overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.12)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(namesLoadProgress / 256) * 100}%`,
                background: 'var(--accent)',
              }}
            />
          </div>
        </div>
      )}

      {!connected && (
        <p
          className="font-mono-display text-caption px-4 py-2 flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
        >
          Connect the GP-200 to browse and manage its patches. The FILE row
          above works offline on the editor’s current patch.
        </p>
      )}

      {/* Patch browser */}
      <div className="flex-1 min-h-0 flex flex-col px-2 pb-2">
        <PatchPicker
          presetNames={presetNames}
          namesLoadProgress={namesLoadProgress}
          currentSlot={currentSlot}
          selected={selected}
          multiSelected={selection.extra}
          onSelect={handleSelect}
          onActivate={handleActivateFromPicker}
          onRowContextMenu={handleRowContextMenu}
          swapSlotLabel={swapSlotLabel}
          protectedBank={bank64Protected ? 64 : null}
          defaultSlotLabel={defaultPatchLabel}
        />
      </div>

      {/* Selected-slot actions */}
      <div
        className="px-4 py-3 space-y-2 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border-active)' }}
      >
        {bank64Changes.length > 0 && !busy && !bulkRunning && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 px-3 py-2 rounded font-mono-display text-caption"
            style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
          >
            <span>Bank 64 changed on the pedal: {bank64Changes.join(', ')}.</span>
            {onRestoreBank64 && !choosingRestore && (
              <Button size="sm" variant="secondary" disabled={!connected} onClick={() => setChoosingRestore(true)}>
                RESTORE 64
              </Button>
            )}
          </div>
        )}
        {(busy || bulkRunning) && (
          // Fades in after a moment (CSS), so quick actions don't flicker it.
          <div role="status" className="pm-working font-mono-display text-caption">
            <span className="pm-spinner" aria-hidden="true" />
            Working with the pedal…
            {bulkProgress && ` ${bulkProgress.done}/${bulkProgress.total}`}
          </div>
        )}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 px-3 py-2 rounded font-mono-display text-caption"
            style={{
              color: 'var(--accent-red, #c05050)',
              border: '1px solid var(--accent-red, #c05050)',
              background: 'rgba(192,80,80,0.06)',
            }}
          >
            <span>{errorMessage}</span>
            {onDismissError && (
              <button
                type="button"
                onClick={onDismissError}
                aria-label="Dismiss error"
                className="font-bold flex-shrink-0"
              >
                ✕
              </button>
            )}
          </div>
        )}
        {renaming && selected !== null && (
          <div className="flex items-center gap-2">
            <span
              className="font-mono-display text-caption flex-shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              {selectedLabel}
            </span>
            <input
              value={renameValue}
              maxLength={16}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value.slice(0, 16))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="flex-1 font-mono-display text-sm rounded px-2 py-1"
              style={{
                background: 'rgba(0,0,0,0.05)',
                border: '1px solid rgba(0,0,0,0.12)',
                color: 'var(--text-primary)',
              }}
            />
            <Button size="sm" onClick={() => void commitRename()}>OK</Button>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            disabled={actionsDisabled}
            onClick={() => {
              if (selected !== null) void runBusy(() => onActivate(selected));
            }}
            title="Switch the device to this slot"
          >
            ACTIVATE
          </Button>
          <Button
            size="sm"
            disabled={actionsDisabled}
            onClick={() => {
              if (selected !== null) void runBusy(() => onOpenInEditor(selected));
            }}
            title="Pull this slot into the editor"
          >
            OPEN
          </Button>
          <Button
            size="sm"
            disabled={actionsDisabled}
            onClick={() => {
              if (selected !== null) void runBusy(() => onExportSlot(selected));
            }}
            title="Download this slot as a .prst file"
          >
            EXPORT
          </Button>
          <Button
            size="sm"
            disabled={actionsDisabled}
            onClick={() => fileInputRef.current?.click()}
            title="Import a .prst file into this slot"
          >
            IMPORT→{selectedLabel || 'SLOT'}
          </Button>
          <Button
            size="sm"
            disabled={actionsDisabled || renameBlocked !== null}
            onClick={startRename}
            title={renameBlocked ?? 'Rename this slot (briefly switches patches)'}
          >
            RENAME
          </Button>
          {onProtectBank64 && onReleaseBank64 && bank64Protected && (
            <Button
              size="sm"
              variant="danger"
              disabled={busy || bulkRunning}
              onClick={() => void runBusy(onReleaseBank64)}
              title="Stop protecting bank 64; its patches stay as they are"
            >
              RELEASE 64
            </Button>
          )}
          {onProtectBank64 && onReleaseBank64 && !bank64Protected && (
            <Button
              size="sm"
              disabled={protectBlocked !== null || confirmingProtect}
              onClick={() => setConfirmingProtect(true)}
              title={protectBlocked ?? 'Set bank 64 aside for the app: blanks, DEFAULT and SWAP SLOT'}
            >
              PROTECT 64
            </Button>
          )}
          {onSaveBank64 && bank64Protected && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!connected || busy || bulkRunning}
              onClick={() => void runBusy(onSaveBank64)}
              title="Back up 64A–64C: kept in this browser and downloaded as a file"
            >
              SAVE 64
            </Button>
          )}
          {onRestoreBank64 && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!connected || busy || bulkRunning || choosingRestore}
              onClick={() => setChoosingRestore(true)}
              title="Put a SAVE 64 backup back into bank 64, and protect it"
            >
              RESTORE 64
            </Button>
          )}
          {onSaveEditorToPedal && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!connected || currentSlot === null || editorPatchName === null || busy || bulkRunning || confirmingSave}
              onClick={() => setConfirmingSave(true)}
              title={`Write every setting of the editor's patch into ${currentLabel} and check it (10–20 s)`}
            >
              SAVE ALL
            </Button>
          )}
          {onSavePatch && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!connected || currentSlot === null || editorPatchName === null || busy || bulkRunning}
              onClick={() => {
                if (currentSlot !== null) void runBusy(() => onSavePatch(currentSlot));
              }}
              title={`Save the patch you're playing into ${currentLabel}, like SAVE on the pedal (quick)`}
            >
              SAVE PATCH
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={onRefreshNames}
            disabled={!connected || namesLoading || namesSyncing || bulkRunning}
            title="Make the list match the pedal: re-read every slot name"
          >
            REFRESH
          </Button>
        </div>
        {onRestoreBank64 && choosingRestore && (
          <div
            role="alertdialog"
            aria-label="Restore bank 64"
            className="flex items-center gap-2 flex-wrap font-mono-display text-caption"
          >
            <span style={{ color: 'var(--text-primary)' }}>
              Restore bank 64 from a backup? This overwrites bank 64 on the pedal.
            </span>
            <Button
              size="sm"
              disabled={bank64SavedAt === null}
              title={bank64SavedAt === null ? 'Nothing saved in this browser yet' : undefined}
              onClick={() => {
                setChoosingRestore(false);
                void runBusy(() => onRestoreBank64('browser'));
              }}
            >
              LAST SAVE{bank64SavedAt ? ` (${new Date(bank64SavedAt).toLocaleString()})` : ''}
            </Button>
            <Button size="sm" onClick={() => restoreFileRef.current?.click()}>
              FROM FILE…
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChoosingRestore(false)}>
              Cancel
            </Button>
            <input
              ref={restoreFileRef}
              type="file"
              accept=".json,application/json"
              hidden
              data-testid="restore-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                setChoosingRestore(false);
                void runBusy(async () => onRestoreBank64({ text: await file.text() }));
              }}
            />
          </div>
        )}
        {onSaveEditorToPedal && confirmingSave && currentSlot !== null && (
          <div
            role="alertdialog"
            aria-label="Confirm save to pedal"
            className="flex items-center gap-2 flex-wrap font-mono-display text-caption"
          >
            <span style={{ color: 'var(--text-primary)' }}>
              Write every setting of the editor’s patch “{editorPatchName}” into {currentLabel} and check it? It replaces what {currentLabel} holds (10–20 s).
            </span>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingSave(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              autoFocus
              onClick={() => {
                setConfirmingSave(false);
                void runBusy(() => onSaveEditorToPedal(currentSlot));
              }}
            >
              Save all
            </Button>
          </div>
        )}
        {onProtectBank64 && !bank64Protected && confirmingProtect && (
          <div
            role="alertdialog"
            aria-label="Confirm protect bank 64"
            className="flex items-center gap-2 flex-wrap font-mono-display text-caption"
          >
            <span style={{ color: 'var(--text-primary)' }}>
              Are you sure? This will overwrite and protect patch bank 64.
            </span>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingProtect(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              autoFocus
              disabled={protectBlocked !== null}
              onClick={() => {
                setConfirmingProtect(false);
                void runBusy(onProtectBank64);
              }}
            >
              OK
            </Button>
          </div>
        )}

        {/* Selection + arrange. Shift-click a second row for a range,
            ctrl/cmd-click to pick slots one at a time. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="font-mono-display text-caption"
            style={{ color: 'var(--text-muted)' }}
            role="status"
            aria-live="polite"
          >
            {selectedSlots.length > 1 ? `${selectedSlots.length} selected` : 'shift/ctrl-click to select more'}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={selected === null || busy || bulkRunning}
            onClick={selectBank}
            title="Select all four slots in this bank"
          >
            SELECT BANK
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={selectedSlots.length < 2 || busy || bulkRunning}
            onClick={clearSelection}
            title="Reduce the selection back to one slot"
          >
            CLEAR
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={actionsDisabled || copyBlocked !== null}
            onClick={copySelection}
            title={selectedSlots.length > 1
              ? `Copy the ${selectedSlots.length} selected patches into the app clipboard`
              : 'Copy this patch into the app clipboard'}
          >
            COPY
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={actionsDisabled || clipboardLabel === null || pasteBlocked !== null}
            onClick={() => {
              if (selected !== null) void runBusy(() => onPasteToSlot(selected));
            }}
            title={pasteToolbarTitle}
          >
            PASTE{clipboardLabel ? ` (${clipboardLabel})` : ''}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={selectedSlots.length !== 2 || !connected || busy || bulkRunning || toolbarSwapBlocked !== null}
            onClick={() => {
              if (selectedSlots.length === 2) {
                void runBusy(() => onSwapSlots(selectedSlots[0], selectedSlots[1]));
              }
            }}
            title={toolbarSwapBlocked ?? 'Exchange the two selected patches'}
          >
            SWAP
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={actionsDisabled || selectedSlots.length !== 1 || selected === 0 || upBlocked !== null}
            onClick={() => {
              if (selected !== null && selected > 0) {
                const target = selected - 1;
                void runBusy(async () => {
                  // Follow the patch only if it actually moved.
                  const swapped = await onSwapSlots(target, selected);
                  if (swapped !== false) setSelection({ anchor: target, extra: new Set() });
                });
              }
            }}
            title={upBlocked ?? 'Swap this patch with the slot above it'}
          >
            ▲ UP
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={actionsDisabled || selectedSlots.length !== 1 || selected === 255 || downBlocked !== null}
            onClick={() => {
              if (selected !== null && selected < 255) {
                const target = selected + 1;
                void runBusy(async () => {
                  // Follow the patch only if it actually moved.
                  const swapped = await onSwapSlots(selected, target);
                  if (swapped !== false) setSelection({ anchor: target, extra: new Set() });
                });
              }
            }}
            title={downBlocked ?? 'Swap this patch with the slot below it'}
          >
            ▼ DOWN
          </Button>
        </div>

        {/* Bulk actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={selectedSlots.length < 2 || !connected || busy || bulkRunning}
            onClick={() => void onExportSlots(selectedSlots)}
            title="Download every selected slot as .prst files in a ZIP"
          >
            EXPORT SELECTED
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={actionsDisabled}
            onClick={() => {
              if (selected !== null) void onExportSlots(bankSlotsOf(selected));
            }}
            title="Download this bank (4 slots) as .prst files in a ZIP"
          >
            EXPORT BANK
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!connected || busy || bulkRunning}
            onClick={() => {
              void onExportSlots(Array.from({ length: 256 }, (_, slot) => slot));
            }}
            title="Download all 256 slots as .prst files in a ZIP"
          >
            EXPORT ALL
          </Button>
          {bulkRunning && (
            <span
              className="font-mono-display text-caption flex items-center gap-2"
              style={{ color: 'var(--text-muted)' }}
              role="status"
              aria-live="polite"
            >
              {bulkProgress.done}/{bulkProgress.total}
              {bulkProgress.cancellable !== false && <button
                type="button"
                onClick={onCancelBulk}
                className="underline"
                style={{ color: 'var(--accent-red, #c05050)' }}
              >
                cancel
              </button>}
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".prst"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleImportPick}
        />
      </div>

      {/* Overwrite confirmation, inline (a nested Dialog would double-bind
          the document Escape handler and close the whole sheet) */}
      {confirmImportSlot !== null && (
        <div
          role="alertdialog"
          aria-label="Confirm overwrite"
          className="px-4 py-3 flex-shrink-0"
          style={{
            borderTop: '1px solid var(--accent-red, #c05050)',
            background: 'rgba(192,80,80,0.06)',
          }}
        >
          <p className="font-mono-display text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
            Overwrite {SysExCodec.slotToLabel(confirmImportSlot)}
            {' '}“{presetNames[confirmImportSlot] ?? '-'}” on the pedal with the file? UNDO can reverse it.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmImportSlot(null)}
            >
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={() => void confirmImport()}>
              Overwrite
            </Button>
          </div>
        </div>
      )}
      {confirmEditorImport && currentSlot !== null && (
        <div
          role="alertdialog"
          aria-label="Save import to pedal"
          className="px-4 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid var(--accent)' }}
        >
          <p className="font-mono-display text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
            “{pendingEditorImportRef.current?.name}” is in the editor. Also save it into {currentLabel} on the
            pedal? It replaces “{presetNames[currentSlot] ?? '-'}”.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirmEditorImport(false);
                pendingEditorImportRef.current = null;
              }}
            >
              Editor only
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const pending = pendingEditorImportRef.current;
                setConfirmEditorImport(false);
                pendingEditorImportRef.current = null;
                if (pending) void runBusy(() => onImportToSlot(currentSlot, pending.bytes));
              }}
            >
              Save to {currentLabel}
            </Button>
          </div>
        </div>
      )}
      {/* Rendered inside the Dialog (as a portal), so its clicks bubble to the
          Dialog panel, which stops them before the overlay could close the
          whole Patch Manager. */}
      <PatchContextMenu
        position={menuAt}
        selectionCount={selectedSlots.length}
        selectionLabel={describeSlots(selectedSlots)}
        clipboardLabel={clipboardLabel}
        clipboardCount={clipboardCount}
        pasteRangeLabel={selected !== null ? describeRange(selected, clipboardCount) : undefined}
        copyBlocked={copyBlocked}
        cutBlocked={cutBlocked}
        onCut={onCutSlot ? () => {
          setMenuAt(null);
          if (selected !== null) void runBusy(() => onCutSlot(selected));
        } : undefined}
        clipboardIsCut={clipboardIsCut}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        historyBlocked={historyBlocked}
        onUndo={onUndo ? () => {
          setMenuAt(null);
          void runBusy(onUndo);
        } : undefined}
        onRedo={onRedo ? () => {
          setMenuAt(null);
          void runBusy(onRedo);
        } : undefined}
        pasteBlocked={pasteBlocked}
        onCopy={() => {
          setMenuAt(null);
          copySelection();
        }}
        onPaste={(method) => {
          setMenuAt(null);
          if (selected === null) return;
          if (method === 'swap') {
            if (onSwapWithClipboard) void runBusy(() => onSwapWithClipboard(selected));
            return;
          }
          void runBusy(() => onPasteToSlot(selected));
        }}
        swapBlocked={swapBlocked}
        swapSlotLabel={swapSlotLabel}
        isSwapSlot={selectionIsSwapSlot}
        setSwapSlotBlocked={setSwapSlotBlocked}
        onSetSwapSlot={() => {
          setMenuAt(null);
          if (selected !== null && onSetSwapSlot) void runBusy(() => onSetSwapSlot(selected));
        }}
        renameBlocked={renameBlocked}
        setDefaultBlocked={setDefaultBlocked}
        defaultInSlot={bank64Protected ? '64C' : null}
        onSetDefault={() => {
          setMenuAt(null);
          if (selected !== null && onSetDefaultPatch) void runBusy(() => onSetDefaultPatch(selected));
        }}
        defaultPatchLabel={defaultPatchLabel}
        resetName={DEFAULT_PATCH_NAME}
        resetBlocked={resetBlocked}
        onReset={() => {
          setMenuAt(null);
          if (selected !== null && onResetSlot) void runBusy(() => onResetSlot(selected));
        }}
        onRename={() => {
          setMenuAt(null);
          // The same inline rename the RENAME button opens.
          startRename();
        }}
        onClose={() => setMenuAt(null)}
      />
    </Dialog>
  );
}
