import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';

/**
 * Right-click menu for the Patch Manager's slot list, laid out per the
 * "Patch List Context Menu" design handoff: selection and clipboard info, then
 * UNDO/REDO, COPY/CUT, PASTE ▸ (Overwrite / Insert / Swap), INSERT ▸, RESET.
 *
 * Only actions that are built and hardware-verified are live (COPY, and PASTE
 * as Overwrite). The rest are shown greyed out with a "Not built yet" tooltip
 * and do nothing, so the menu never offers a broken action.
 *
 * Styled with the app's own theme variables rather than the handoff's colours,
 * and without keyboard-shortcut hints, since none are wired up yet.
 */

const MENU_WIDTH = 240;
const SUBMENU_WIDTH = 280;
const GAP = 6;
const EDGE = 8;
const NOT_BUILT = 'Not built yet';

export interface PatchContextMenuProps {
  /** Viewport point to open at; null when closed. */
  position: { x: number; y: number } | null;
  selectionCount: number;
  /** "17D", "1A–1C", … */
  selectionLabel: string;
  /** Slot on the clipboard ("16B"), or null when nothing is copied. */
  clipboardLabel: string | null;
  /** Why COPY can't run right now, or null when it can. */
  copyBlocked: string | null;
  /** Why PASTE can't run right now, or null when it can. */
  pasteBlocked: string | null;
  onCopy: () => void;
  /** Paste the clipboard over the selected slot. */
  onPaste: () => void;
  /** Why RENAME can't run right now, or null when it can. */
  renameBlocked: string | null;
  /** Open the Patch Manager's inline rename for the selected slot. */
  onRename: () => void;
  /** Why SET AS DEFAULT PATCH can't run right now, or null when it can. */
  setDefaultBlocked: string | null;
  /** Make the selected slot the template RESET copies. */
  onSetDefault: () => void;
  /** Slot holding the default patch ("5B"), or null when none is set. */
  defaultPatchLabel: string | null;
  /** Name reset patches are saved under. */
  resetName: string;
  /** Why RESET can't run right now, or null when it can. */
  resetBlocked: string | null;
  /** Copy the default patch over the selected slot (after confirming). */
  onReset: () => void;
  onClose: () => void;
}

interface Placement {
  menu: { left: number; top: number };
  submenu: { left: number; top: number };
}

export function PatchContextMenu({
  position,
  selectionCount,
  selectionLabel,
  clipboardLabel,
  copyBlocked,
  pasteBlocked,
  onCopy,
  onPaste,
  renameBlocked,
  onRename,
  setDefaultBlocked,
  onSetDefault,
  defaultPatchLabel,
  resetName,
  resetBlocked,
  onReset,
  onClose,
}: PatchContextMenuProps) {
  const [pasteOpen, setPasteOpen] = useState(false);
  // RESET overwrites a patch, so it asks first, inside the menu (per the design).
  const [confirmReset, setConfirmReset] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const pasteItemRef = useRef<HTMLButtonElement>(null);

  // Each opening starts from the plain menu, unplaced. Reset during render
  // (React's pattern for state that follows a prop): as an effect it ran after
  // the placement below and wiped it, leaving the menu invisible.
  const [openedAt, setOpenedAt] = useState(position);
  if (position !== openedAt) {
    setOpenedAt(position);
    setPasteOpen(false);
    setConfirmReset(false);
    setPlacement(null);
  }

  // Keep the menu (and the paste options beside it) on screen: flip left or
  // up when the pointer is near an edge. Measured before paint, so it never
  // flashes in the wrong place.
  useLayoutEffect(() => {
    if (!position || !menuRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    const menuWidth = menuRect.width || MENU_WIDTH;
    const menuHeight = menuRect.height;
    let left = position.x;
    if (left + menuWidth > window.innerWidth - EDGE) left = Math.max(EDGE, position.x - menuWidth);
    let top = position.y;
    if (top + menuHeight > window.innerHeight - EDGE) top = Math.max(EDGE, window.innerHeight - menuHeight - EDGE);

    const submenuHeight = submenuRef.current?.getBoundingClientRect().height ?? 0;
    let subLeft = left + menuWidth + GAP;
    if (subLeft + SUBMENU_WIDTH > window.innerWidth - EDGE) subLeft = Math.max(EDGE, left - SUBMENU_WIDTH - GAP);
    let subTop = top;
    if (subTop + submenuHeight > window.innerHeight - EDGE) {
      subTop = Math.max(EDGE, window.innerHeight - submenuHeight - EDGE);
    }
    setPlacement({ menu: { left, top }, submenu: { left: subLeft, top: subTop } });
  }, [position, pasteOpen, confirmReset]);

  // Focus the first available action when the menu appears.
  useEffect(() => {
    if (!position || !placement || pasteOpen || confirmReset) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
  }, [position, placement, pasteOpen, confirmReset]);

  // Escape steps back (paste options, then the menu) and Tab closes it. Caught
  // in the capture phase: the Patch Manager closes itself on Escape at the
  // document, and would otherwise close underneath the menu.
  useEffect(() => {
    if (!position) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' && event.key !== 'Tab') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape' && pasteOpen) {
        setPasteOpen(false);
        pasteItemRef.current?.focus();
        return;
      }
      if (event.key === 'Escape' && confirmReset) {
        setConfirmReset(false);
        return;
      }
      onClose();
    }
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onClose);
    };
  }, [position, pasteOpen, confirmReset, onClose]);

  if (!position) return null;

  // Arrow keys move between the actions that are available.
  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [],
    );
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length].focus();
  }

  const pasteState = pasteBlocked ?? (clipboardLabel === null ? 'Copy a patch first' : null);
  const hidden = placement === null;

  const selectionText = selectionCount === 1
    ? `1 patch selected (${selectionLabel})`
    : `${selectionCount} patches selected · ${selectionLabel}`;

  return createPortal(
    <>
      <div
        data-testid="patch-menu-backdrop"
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Patch actions"
        onKeyDown={onMenuKeyDown}
        className="font-mono-display"
        style={{
          ...panelStyle,
          width: MENU_WIDTH,
          padding: 6,
          left: placement?.menu.left ?? position.x,
          top: placement?.menu.top ?? position.y,
          visibility: hidden ? 'hidden' : 'visible',
        }}
      >
        <div className="text-caption px-2 pt-1.5 pb-1" style={{ color: 'var(--text-muted)' }}>
          {selectionText}
        </div>
        {clipboardLabel !== null && (
          <div className="text-caption px-2 pb-1.5" style={{ color: 'var(--accent)' }}>
            clip: {clipboardLabel} · 1 patch
          </div>
        )}
        {confirmReset ? (
          <div role="alertdialog" aria-label="Confirm reset" className="px-1.5 pt-1 pb-0.5">
            <Divider />
            <p className="text-caption pt-1.5 pb-2.5" style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
              Reset {selectionLabel} to your default patch (from {defaultPatchLabel}) as
              “{resetName}”? The patch there is overwritten, and there’s no undo yet.
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" autoFocus onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" onClick={onReset}>
                Reset
              </Button>
            </div>
          </div>
        ) : (
        <>
        <Divider />
        <MenuItem label="UNDO" blocked={NOT_BUILT} />
        <MenuItem label="REDO" blocked={NOT_BUILT} />
        <Divider />
        <MenuItem label="COPY" blocked={copyBlocked} onSelect={onCopy} />
        <MenuItem label="CUT" danger blocked={NOT_BUILT} />
        <Divider />
        <MenuItem
          ref={pasteItemRef}
          label="PASTE"
          trailing="▸"
          blocked={pasteState}
          expanded={pasteOpen}
          onSelect={() => setPasteOpen(true)}
        />
        <Divider />
        <MenuItem label="INSERT" trailing="▸" blocked={NOT_BUILT} />
        <Divider />
        <MenuItem label="RENAME" blocked={renameBlocked} onSelect={onRename} />
        <MenuItem label="SET AS DEFAULT PATCH" blocked={setDefaultBlocked} onSelect={onSetDefault} />
        <Divider />
        <MenuItem label="RESET" danger blocked={resetBlocked} onSelect={() => setConfirmReset(true)} />
        </>
        )}
      </div>

      {pasteOpen && clipboardLabel !== null && (
        <div
          ref={submenuRef}
          role="dialog"
          aria-label="Paste options"
          className="font-mono-display"
          style={{
            ...panelStyle,
            width: SUBMENU_WIDTH,
            padding: 10,
            left: placement?.submenu.left ?? position.x,
            top: placement?.submenu.top ?? position.y,
            visibility: hidden ? 'hidden' : 'visible',
          }}
        >
          <div className="text-caption px-1 pb-2.5" style={{ color: 'var(--text-muted)' }}>
            Paste 1 patch starting at {selectionLabel}
          </div>
          <div role="radiogroup" aria-label="Paste method">
            <PasteOption
              label="OVERWRITE"
              description={`Replaces ${selectionLabel} with ${clipboardLabel}`}
              checked
            />
            <PasteOption label="INSERT" description="Shifts the list down · last patch lost" blocked={NOT_BUILT} />
            <PasteOption
              label="SWAP"
              description={`Exchanges ${clipboardLabel} and ${selectionLabel} · nothing lost`}
              blocked={NOT_BUILT}
            />
          </div>
          <div
            className="flex justify-end gap-2 mt-2.5 pt-2.5"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPasteOpen(false);
                pasteItemRef.current?.focus();
              }}
            >
              Cancel
            </Button>
            <Button size="sm" autoFocus onClick={onPaste}>
              OK
            </Button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}

const panelStyle = {
  position: 'fixed',
  zIndex: 1000,
  background: 'var(--bg-surface-raised)',
  // The app's accent (light blue in the dark theme) sets the menu apart
  // from the panels it opens over.
  border: '1px solid var(--accent)',
  borderRadius: 8,
  boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
  color: 'var(--text-primary)',
} as const;

function Divider() {
  return <div role="separator" style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 2px' }} />;
}

interface MenuItemProps {
  label: string;
  /** Why the action is unavailable, shown as its tooltip; null when available. */
  blocked: string | null;
  onSelect?: () => void;
  trailing?: ReactNode;
  danger?: boolean;
  expanded?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

// aria-disabled rather than `disabled`, so the "why not" tooltip still shows
// on hover (browsers suppress tooltips on disabled buttons).
function MenuItem({ label, blocked, onSelect, trailing, danger = false, expanded, ref }: MenuItemProps) {
  const available = blocked === null;
  let color = 'var(--text-primary)';
  if (danger) color = 'var(--accent-red)';
  if (!available) color = 'var(--text-muted)';
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      aria-disabled={!available}
      aria-haspopup={trailing ? 'dialog' : undefined}
      aria-expanded={expanded}
      title={blocked ?? undefined}
      onClick={() => {
        if (available) onSelect?.();
      }}
      className="w-full flex items-center justify-between px-2.5 py-2 rounded text-label font-bold tracking-wider text-left focus:outline-none hover:bg-bg-hover focus:bg-bg-hover"
      style={{
        color,
        opacity: available ? 1 : 0.5,
        cursor: available ? 'pointer' : 'not-allowed',
      }}
    >
      <span>{label}</span>
      {trailing && <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>{trailing}</span>}
    </button>
  );
}

interface PasteOptionProps {
  label: string;
  description: string;
  checked?: boolean;
  blocked?: string;
}

function PasteOption({ label, description, checked = false, blocked }: PasteOptionProps) {
  const available = blocked === undefined;
  return (
    <div
      role="radio"
      aria-checked={checked}
      aria-disabled={!available}
      title={blocked}
      className="flex gap-2.5 items-start px-3 py-2.5 rounded"
      style={{
        background: checked ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
        opacity: available ? 1 : 0.45,
        cursor: available ? 'default' : 'not-allowed',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 14,
          height: 14,
          marginTop: 2,
          flexShrink: 0,
          borderRadius: '50%',
          border: `2px solid ${checked ? 'var(--accent)' : 'var(--text-muted)'}`,
          background: checked ? 'var(--accent)' : 'transparent',
          boxShadow: checked ? 'inset 0 0 0 3px var(--bg-surface-raised)' : 'none',
        }}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-label font-bold tracking-wider" style={{ color: 'var(--text-primary)' }}>
          {label}
          {!available && <span style={{ color: 'var(--text-muted)' }}> · {blocked}</span>}
        </span>
        <span className="text-caption" style={{ color: 'var(--text-muted)' }}>{description}</span>
      </span>
    </div>
  );
}
