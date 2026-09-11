/**
 * PatchContextMenu — right-click context menu for the 256-slot patch list.
 *
 * Renders via a React portal so it escapes any overflow:hidden containers.
 * All destructive actions gate behind an inline confirm step (when
 * confirmDestructive is true, the default).
 *
 * Undo/Redo items are present but always disabled in this release; the
 * history-stack implementation is planned for a follow-up.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SysExCodec } from '@/core/SysExCodec';

// ── Design constants ──────────────────────────────────────────────────────────
const MENU_W = 240;   // px — main menu width
const SUB_W  = 280;   // px — sub-panel width
const FLIP_X_THRESHOLD = MENU_W + SUB_W + 24; // flip when too close to right edge
const FLIP_Y_THRESHOLD = 340;                  // flip when too close to bottom

// ── Types ────────────────────────────────────────────────────────────────────

export type PasteMethod  = 'overwrite' | 'insert' | 'swap';
export type InsertMode   = 'default' | 'clipboard';

export interface ContextMenuClipboard {
  /** Source slot indices the clipboard was copied from. */
  source: number[];
  /** Human-readable range label, e.g. "3A–3C". */
  label: string;
  /** Number of patches in the clipboard. */
  count: number;
}

export interface PatchContextMenuProps {
  /** Pixel coordinates where the menu should open.  null = hidden. */
  position: { x: number; y: number } | null;
  /** Currently selected slot indices (sorted ascending). */
  selection: number[];
  /** Current clipboard contents, or null if empty. */
  clipboard: ContextMenuClipboard | null;
  /** Total number of slots in the list (256 for the GP-200). */
  totalSlots?: number;
  /** Default paste method when opening the paste sub-panel. */
  defaultPasteMethod?: PasteMethod;
  /** When false, CUT and RESET execute immediately without a confirm step. */
  confirmDestructive?: boolean;
  /** Undo available (history stack non-empty). */
  canUndo?: boolean;
  /** Redo available (future stack non-empty). */
  canRedo?: boolean;
  onClose:  () => void;
  onCopy:   () => void;
  onCut:    () => void;
  onPaste:  (method: PasteMethod) => void;
  onInsert: (mode: InsertMode, count: number) => void;
  onReset:  () => void;
  onUndo:   () => void;
  onRedo:   () => void;
}

// ── Helper: human-readable range label ───────────────────────────────────────

export function rangeLabel(slots: number[]): string {
  const sorted = [...slots].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return SysExCodec.slotToLabel(sorted[0]);
  const span = sorted[sorted.length - 1] - sorted[0];
  const contiguous = span === sorted.length - 1;
  if (contiguous) {
    return `${SysExCodec.slotToLabel(sorted[0])}–${SysExCodec.slotToLabel(sorted[sorted.length - 1])}`;
  }
  if (sorted.length <= 4) return sorted.map(s => SysExCodec.slotToLabel(s)).join(', ');
  return sorted.slice(0, 3).map(s => SysExCodec.slotToLabel(s)).join(', ') + ` +${sorted.length - 3}`;
}

// ── Inline styles (CSS-variable–based, theme-aware) ──────────────────────────

const S = {
  menu: (x: number, y: number, flipX: boolean, flipY: boolean): React.CSSProperties => ({
    position: 'fixed',
    zIndex: 9000,
    width: MENU_W,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-active)',
    borderRadius: 8,
    padding: 6,
    boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
    fontFamily: 'var(--font-jetbrains-mono), monospace',
    fontSize: 12.5,
    color: 'var(--text-primary)',
    ...(flipX ? { right: window.innerWidth - x } : { left: x }),
    ...(flipY ? { bottom: window.innerHeight - y } : { top: y }),
  }),

  submenu: (x: number, y: number, flipX: boolean, flipY: boolean): React.CSSProperties => ({
    position: 'fixed',
    zIndex: 9001,
    width: SUB_W,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-active)',
    borderRadius: 8,
    padding: 10,
    boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
    fontFamily: 'var(--font-jetbrains-mono), monospace',
    fontSize: 12.5,
    color: 'var(--text-primary)',
    ...(flipX
      ? { right: (window.innerWidth - x) + MENU_W + 6 }
      : { left: x + MENU_W + 6 }),
    ...(flipY ? { bottom: window.innerHeight - y } : { top: y }),
  }),

  overlay: (): React.CSSProperties => ({
    position: 'fixed',
    inset: 0,
    zIndex: 8999,
  }),

  infoLine: (accent?: boolean): React.CSSProperties => ({
    fontSize: 11,
    color: accent ? 'var(--accent)' : 'var(--text-muted)',
    padding: '5px 8px 3px',
    letterSpacing: 0.3,
    lineHeight: 1.3,
  }),

  divider: (): React.CSSProperties => ({
    height: 1,
    background: 'var(--border-subtle)',
    margin: '3px 2px',
  }),

  item: (opts: { disabled?: boolean; red?: boolean; focused?: boolean }): React.CSSProperties => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '7px 10px',
    borderRadius: 6,
    cursor: opts.disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    letterSpacing: 0.5,
    color: opts.red ? 'var(--accent-red)' : opts.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
    opacity: opts.disabled ? 0.45 : 1,
    background: opts.focused ? 'var(--bg-hover)' : 'transparent',
    userSelect: 'none',
  }),

  shortcut: (): React.CSSProperties => ({
    color: 'var(--text-muted)',
    fontWeight: 400,
    fontSize: 11,
    flexShrink: 0,
  }),

  subHeader: (): React.CSSProperties => ({
    fontSize: 11,
    color: 'var(--text-muted)',
    padding: '2px 4px 8px',
    letterSpacing: 0.3,
    lineHeight: 1.4,
  }),

  radioRow: (selected: boolean, disabled?: boolean): React.CSSProperties => ({
    display: 'flex',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 6,
    alignItems: 'flex-start',
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: selected ? 'rgba(var(--accent-rgb, 11,111,130), 0.10)' : 'transparent',
    opacity: disabled ? 0.4 : 1,
    userSelect: 'none',
  }),

  radioDot: (selected: boolean): React.CSSProperties => ({
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: `2px solid ${selected ? 'var(--accent)' : 'var(--text-muted)'}`,
    marginTop: 2,
    flexShrink: 0,
    background: selected ? 'var(--accent)' : 'transparent',
    boxShadow: selected ? 'inset 0 0 0 3px var(--bg-elevated)' : 'none',
  }),

  radioLabel: (): React.CSSProperties => ({
    color: 'var(--text-primary)',
    fontSize: 12.5,
    fontWeight: 600,
    letterSpacing: 0.4,
    display: 'block',
  }),

  radioDesc: (): React.CSSProperties => ({
    color: 'var(--text-muted)',
    fontSize: 11,
    lineHeight: 1.4,
    display: 'block',
    marginTop: 2,
  }),

  buttonRow: (): React.CSSProperties => ({
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 10,
    borderTop: '1px solid var(--border-subtle)',
  }),

  btnGhost: (): React.CSSProperties => ({
    background: 'transparent',
    border: '1px solid var(--border-active)',
    color: 'var(--text-primary)',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }),

  btnAccent: (): React.CSSProperties => ({
    background: 'var(--accent)',
    border: 'none',
    color: 'var(--bg-elevated)',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 11.5,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }),

  btnRed: (): React.CSSProperties => ({
    background: 'var(--accent-red)',
    border: 'none',
    color: '#fff',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 11.5,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }),

  confirmText: (): React.CSSProperties => ({
    fontSize: 12,
    color: 'var(--text-primary)',
    lineHeight: 1.5,
    padding: '4px 4px 10px',
  }),

  insertCountRow: (): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    marginTop: 4,
  }),

  insertCountInput: (): React.CSSProperties => ({
    width: 60,
    background: 'var(--bg-input)',
    border: '1px solid var(--border-active)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    padding: '5px 8px',
    fontSize: 13,
    fontFamily: 'inherit',
    textAlign: 'center',
  }),

  warning: (): React.CSSProperties => ({
    fontSize: 11,
    color: 'var(--accent-red)',
    padding: '6px 10px 0',
    lineHeight: 1.4,
  }),
};

// ── Key order for keyboard navigation ────────────────────────────────────────
const ITEM_ORDER = ['undo', 'redo', 'copy', 'cut', 'paste', 'insert', 'reset'] as const;
type ItemKey = typeof ITEM_ORDER[number];

// ── Component ─────────────────────────────────────────────────────────────────

export function PatchContextMenu({
  position,
  selection,
  clipboard,
  totalSlots = 256,
  defaultPasteMethod = 'overwrite',
  confirmDestructive = true,
  canUndo = false,
  canRedo = false,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onInsert,
  onReset,
  onUndo,
  onRedo,
}: PatchContextMenuProps) {
  // Internal sub-state
  const [submenu,     setSubmenu]     = useState<'paste' | 'insert' | null>(null);
  const [confirm,     setConfirm]     = useState<'cut' | 'reset' | null>(null);
  const [pasteMethod, setPasteMethod] = useState<PasteMethod>(defaultPasteMethod);
  const [insertMode,  setInsertMode]  = useState<InsertMode>('default');
  const [insertCount, setInsertCount] = useState(1);
  const [focusedKey,  setFocusedKey]  = useState<ItemKey>('copy');

  // Reset internal state when menu opens at a new position
  const prevPos = useRef<typeof position>(null);
  if (position !== prevPos.current) {
    prevPos.current = position;
    if (position) {
      setSubmenu(null);
      setConfirm(null);
      setPasteMethod(defaultPasteMethod);
      setInsertMode('default');
      setInsertCount(1);
      setFocusedKey('copy');
    }
  }

  // Keyboard navigation
  useEffect(() => {
    if (!position) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirm) setConfirm(null);
        else if (submenu) setSubmenu(null);
        else onClose();
        return;
      }
      if (submenu || confirm) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedKey(k => ITEM_ORDER[(ITEM_ORDER.indexOf(k) + 1) % ITEM_ORDER.length]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedKey(k => ITEM_ORDER[(ITEM_ORDER.indexOf(k) - 1 + ITEM_ORDER.length) % ITEM_ORDER.length]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        triggerKey(focusedKey);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, submenu, confirm, focusedKey, canUndo, canRedo, clipboard]);

  if (!position) return null;

  // Compute flip
  const flipX = position.x > window.innerWidth  - FLIP_X_THRESHOLD;
  const flipY = position.y > window.innerHeight - FLIP_Y_THRESHOLD;

  // Derived display values
  const selSorted  = [...selection].sort((a, b) => a - b);
  const selLabel   = rangeLabel(selSorted);
  const selCount   = selSorted.length;
  const targetSlot = selSorted[0] ?? 0;
  const targetLabel = SysExCodec.slotToLabel(targetSlot);

  const selInfoText = selCount === 1
    ? `1 patch selected (${selLabel})`
    : `${selCount} patches selected · ${selLabel}`;

  const hasClip      = !!clipboard;
  const pasteEnabled = hasClip;

  // Bump-off warning for insert
  const lastRangeStart = totalSlots - insertCount;
  const bumpSlots = Array.from({ length: Math.min(insertCount, totalSlots) }, (_, k) => lastRangeStart + k);
  const bumpLabel = rangeLabel(bumpSlots);

  // Paste sub-panel text
  let pasteEndLabel = targetLabel;
  if (clipboard && clipboard.count > 1) {
    pasteEndLabel = `${targetLabel}–${SysExCodec.slotToLabel(Math.min(targetSlot + clipboard.count - 1, totalSlots - 1))}`;
  }
  const pasteHeaderText = clipboard
    ? `Paste ${clipboard.count} patch${clipboard.count > 1 ? 'es' : ''} starting at ${targetLabel}`
    : '';

  // Confirm messages
  const confirmMap = {
    cut: {
      message: `Cut ${selCount} patch${selCount > 1 ? 'es' : ''} (${selLabel})? Slots below shift up; freed slots at the end are cleared.`,
      label: 'Cut',
    },
    reset: {
      message: `Reset ${selCount} patch${selCount > 1 ? 'es' : ''} (${selLabel}) to default?`,
      label: 'Reset',
    },
  };

  // Action handlers
  function triggerKey(key: ItemKey) {
    if (key === 'undo')   { if (canUndo) { onUndo(); onClose(); } }
    else if (key === 'redo')   { if (canRedo) { onRedo(); onClose(); } }
    else if (key === 'copy')   { onCopy(); onClose(); }
    else if (key === 'cut')    { handleCutClick(); }
    else if (key === 'paste')  { if (pasteEnabled) handlePasteClick(); }
    else if (key === 'insert') { handleInsertClick(); }
    else if (key === 'reset')  { handleResetClick(); }
  }

  function handleCopyClick()   { onCopy(); onClose(); }
  function handleCutClick()    { if (confirmDestructive) setConfirm('cut'); else { onCut(); onClose(); } }
  function handlePasteClick()  { if (!pasteEnabled) return; setSubmenu('paste'); }
  function handleInsertClick() { setSubmenu('insert'); }
  function handleResetClick()  { if (confirmDestructive) setConfirm('reset'); else { onReset(); onClose(); } }

  function handlePasteOk()   { onPaste(pasteMethod); onClose(); }
  function handleInsertOk()  { onInsert(insertMode, insertCount); onClose(); }
  function handleRunConfirm() {
    if (confirm === 'cut')   { onCut();   onClose(); }
    if (confirm === 'reset') { onReset(); onClose(); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  const menu = (
    <>
      {/* Backdrop to close on outside click */}
      <div style={S.overlay()} onClick={onClose} />

      {/* Main menu */}
      <div style={S.menu(position.x, position.y, flipX, flipY)} onClick={stopProp}>
        {confirm ? (
          // ── Confirm state ──
          <>
            <div style={S.confirmText()}>{confirmMap[confirm].message}</div>
            <div style={S.buttonRow()}>
              <button style={S.btnGhost()} onClick={() => setConfirm(null)}>Cancel</button>
              <button style={S.btnRed()}   onClick={handleRunConfirm}>{confirmMap[confirm].label}</button>
            </div>
          </>
        ) : (
          // ── Normal menu items ──
          <>
            <div style={S.infoLine()}>{selInfoText}</div>
            {hasClip && (
              <div style={S.infoLine(true)}>
                clip: {clipboard!.label} · {clipboard!.count} patch{clipboard!.count > 1 ? 'es' : ''}
              </div>
            )}

            {/* UNDO / REDO */}
            <div
              style={S.item({ disabled: !canUndo, focused: focusedKey === 'undo' })}
              onClick={() => { if (canUndo) { onUndo(); onClose(); } }}
              onMouseEnter={() => setFocusedKey('undo')}
            >
              <span>UNDO</span>
              <span style={S.shortcut()}>⌘Z</span>
            </div>
            <div
              style={S.item({ disabled: !canRedo, focused: focusedKey === 'redo' })}
              onClick={() => { if (canRedo) { onRedo(); onClose(); } }}
              onMouseEnter={() => setFocusedKey('redo')}
            >
              <span>REDO</span>
              <span style={S.shortcut()}>⌘Y</span>
            </div>

            <div style={S.divider()} />

            {/* COPY */}
            <div
              style={S.item({ focused: focusedKey === 'copy' })}
              onClick={handleCopyClick}
              onMouseEnter={() => setFocusedKey('copy')}
            >
              <span>COPY</span>
              <span style={S.shortcut()}>⌘C</span>
            </div>

            {/* CUT */}
            <div
              style={S.item({ red: true, focused: focusedKey === 'cut' })}
              onClick={handleCutClick}
              onMouseEnter={() => setFocusedKey('cut')}
            >
              <span>CUT</span>
              <span style={S.shortcut()}>⌘X</span>
            </div>

            <div style={S.divider()} />

            {/* PASTE */}
            <div
              style={S.item({ disabled: !pasteEnabled, focused: focusedKey === 'paste' })}
              onClick={handlePasteClick}
              onMouseEnter={() => setFocusedKey('paste')}
            >
              <span>PASTE</span>
              <span style={S.shortcut()}>{pasteEnabled ? '▸' : '⌘V'}</span>
            </div>

            <div style={S.divider()} />

            {/* INSERT */}
            <div
              style={S.item({ focused: focusedKey === 'insert' })}
              onClick={handleInsertClick}
              onMouseEnter={() => setFocusedKey('insert')}
            >
              <span>INSERT</span>
              <span style={S.shortcut()}>▸</span>
            </div>

            <div style={S.divider()} />

            {/* RESET */}
            <div
              style={S.item({ red: true, focused: focusedKey === 'reset' })}
              onClick={handleResetClick}
              onMouseEnter={() => setFocusedKey('reset')}
            >
              <span>RESET</span>
            </div>
          </>
        )}
      </div>

      {/* ── Paste sub-panel ── */}
      {submenu === 'paste' && (
        <div style={S.submenu(position.x, position.y, flipX, flipY)} onClick={stopProp}>
          <div style={S.subHeader()}>{pasteHeaderText}</div>

          {/* OVERWRITE */}
          <div style={S.radioRow(pasteMethod === 'overwrite')} onClick={() => setPasteMethod('overwrite')}>
            <div style={S.radioDot(pasteMethod === 'overwrite')} />
            <div>
              <span style={S.radioLabel()}>OVERWRITE</span>
              <span style={S.radioDesc()}>Replaces {pasteEndLabel} with clipboard content</span>
            </div>
          </div>

          {/* INSERT */}
          <div style={S.radioRow(pasteMethod === 'insert')} onClick={() => setPasteMethod('insert')}>
            <div style={S.radioDot(pasteMethod === 'insert')} />
            <div>
              <span style={S.radioLabel()}>INSERT</span>
              <span style={S.radioDesc()}>
                Shifts list down · last {clipboard?.count ?? 1} patch{(clipboard?.count ?? 1) > 1 ? 'es' : ''} lost
              </span>
            </div>
          </div>

          {/* SWAP */}
          <div style={S.radioRow(pasteMethod === 'swap')} onClick={() => setPasteMethod('swap')}>
            <div style={S.radioDot(pasteMethod === 'swap')} />
            <div>
              <span style={S.radioLabel()}>SWAP</span>
              <span style={S.radioDesc()}>Exchanges clipboard with {pasteEndLabel} · nothing lost</span>
            </div>
          </div>

          <div style={S.buttonRow()}>
            <button style={S.btnGhost()} onClick={() => setSubmenu(null)}>Cancel</button>
            <button style={S.btnAccent()} onClick={handlePasteOk}>OK</button>
          </div>
        </div>
      )}

      {/* ── Insert sub-panel ── */}
      {submenu === 'insert' && (
        <div style={S.submenu(position.x, position.y, flipX, flipY)} onClick={stopProp}>
          <div style={S.subHeader()}>Insert at {targetLabel}</div>

          {/* DEFAULT PATCH */}
          <div style={S.radioRow(insertMode === 'default')} onClick={() => setInsertMode('default')}>
            <div style={S.radioDot(insertMode === 'default')} />
            <div>
              <span style={S.radioLabel()}>DEFAULT PATCH</span>
              <span style={S.radioDesc()}>Insert blank init patch(es)</span>
            </div>
          </div>

          {/* FROM CLIPBOARD */}
          <div
            style={S.radioRow(insertMode === 'clipboard', !hasClip)}
            onClick={() => { if (hasClip) setInsertMode('clipboard'); }}
          >
            <div style={S.radioDot(insertMode === 'clipboard')} />
            <div>
              <span style={S.radioLabel()}>SELECTED PATCHES</span>
              <span style={S.radioDesc()}>Copy clipboard content into new slots</span>
            </div>
          </div>

          {/* Count stepper */}
          <div style={S.insertCountRow()}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Count</span>
            <input
              type="number"
              min={1}
              max={99}
              value={insertCount}
              onChange={(e) => {
                let v = parseInt(e.target.value, 10);
                if (isNaN(v)) v = 1;
                setInsertCount(Math.max(1, Math.min(99, v)));
              }}
              style={S.insertCountInput()}
            />
          </div>

          {/* Bump-off warning */}
          <div style={S.warning()}>
            ⚠ {insertCount} patch{insertCount > 1 ? 'es' : ''} at {bumpLabel} will be lost.
          </div>

          <div style={S.buttonRow()}>
            <button style={S.btnGhost()} onClick={() => setSubmenu(null)}>Cancel</button>
            <button style={S.btnAccent()} onClick={handleInsertOk}>Insert</button>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(menu, document.body);
}
