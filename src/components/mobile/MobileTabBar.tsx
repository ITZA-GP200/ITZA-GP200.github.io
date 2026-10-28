import { ActionIcon, type ActionIconName } from '@/components/board/ActionIcon';
import { BarsIcon, DialIcon } from '@/components/board/StyleIcons';
import type { ControlStyle } from '@/core/boardSkin';

export type MobileTab = 'chain' | 'patches' | 'loop' | 'drums' | 'device';

const TABS: { id: MobileTab; label: string; icon: ActionIconName }[] = [
  { id: 'chain', label: 'CHAIN', icon: 'fxloop' },
  { id: 'patches', label: 'PATCHES', icon: 'patches' },
  { id: 'loop', label: 'LOOP', icon: 'loop' },
  { id: 'drums', label: 'DRUMS', icon: 'drums' },
  { id: 'device', label: 'DEVICE', icon: 'connect' },
];

interface MobileTabBarProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
  /* ── ITZA skin (fork) ────────────────────────────────────────────────── */
  /** The board-wide control style, for the sixth "every pedal" button. */
  boardStyle?: ControlStyle;
  onBoardStyleChange?: (style: ControlStyle) => void;
}

/**
 * Fixed bottom navigation. Sits in the thumb zone and is padded past the home
 * indicator, so the primary way to move around the app is always reachable
 * one-handed , the desktop equivalents are spread between the top bar and the
 * floating deck, neither of which survives a phone viewport.
 */
export function MobileTabBar({
  active,
  onChange,
  boardStyle = 'dial',
  onBoardStyleChange,
}: MobileTabBarProps) {
  const toAll: ControlStyle = boardStyle === 'dial' ? 'bar' : 'dial';
  return (
    <nav
      className={`m-tabbar${onBoardStyleChange ? ' m-pk-bar' : ''}`}
      aria-label="Sections"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`m-tab${tab.id === active ? ' active' : ''}`}
          aria-current={tab.id === active ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <ActionIcon name={tab.icon} className="m-tab-icon" />
          <span className="m-tab-label">{tab.label}</span>
        </button>
      ))}

      {/* Not a section: the board bar's "every unlocked pedal" style switch,
          which the phone has nowhere else to put. One button rather than the
          desktop's pair, and like a card's own toggle it shows where pressing
          it goes, not where it is. */}
      {onBoardStyleChange && (
        <button
          type="button"
          className="m-tab m-tab-all"
          aria-label={`${toAll === 'bar' ? 'Bars' : 'Dials'} on every pedal`}
          onClick={() => onBoardStyleChange(toAll)}
        >
          {toAll === 'bar'
            ? <BarsIcon size={20} className="m-tab-icon" />
            : <DialIcon size={20} className="m-tab-icon" />}
          <span className="m-tab-label">{toAll === 'bar' ? 'ALL BARS' : 'ALL DIALS'}</span>
        </button>
      )}
    </nav>
  );
}
