import type { UseMidiDeviceReturn } from '@/hooks/useMidiDevice';
import { SysExCodec } from '@/core/SysExCodec';
import { SLOT_MODULES } from '@/core/effectNames';
import { DEFAULT_KEY } from '@/core/boardSkin';
import { useConnectCta } from '@/components/landing/useConnectCta';
import './start.css';

interface StartScreenProps {
  midiDevice: UseMidiDeviceReturn;
  /** open the editor with a blank INIT preset */
  onOpenBlank: () => void;
  /** open the editor with the connected device's current preset */
  onOpenCurrent: () => void;
  loadError: string | null;
  onDismissError: () => void;
}

/** Written in sentence case and capitalised by CSS (.start-feature), so the
 *  text stays readable in the source and to a screen reader. */
const FEATURES: { text: string; color: string }[] = [
  { text: 'The GP200 Studio web app, plus', color: '#ffc94a' },
  { text: 'New patch management features', color: '#ff8c42' },
  { text: 'New right-click functions', color: '#5a8ff0' },
  { text: 'New default patch customizer', color: '#2fd4a7' },
  { text: 'New simple-tech pedalboard UI', color: '#3fc9d9' },
];

/**
 * What `/` serves: the app's front door, and nothing else.
 *
 * It wears the board's own skin rather than a second visual language — the
 * same dark field and card, the same key colours, the same one grey, the same
 * solid triangle the chain uses to mean "the signal goes this way". The strip
 * of blocks across the top says "pedalboard editor" before a word is read.
 *
 * Two actions only: connect the GP-200, or open the editor on a blank preset.
 * Connect sits in a lit card, carrying the glow a live block has, so the thing
 * you are meant to do reads as ACTIVE.
 *
 * It is prerendered from a disconnected stub (src/prerender/entry-server.tsx),
 * so it must read completely with JavaScript off and touch no browser global
 * during render. The connect label and flags come from useConnectCta, the same
 * state machine the tour's buttons use, so the two front pages describe a
 * handshake alike.
 */
export function StartScreen({
  midiDevice,
  onOpenBlank,
  onOpenCurrent,
  loadError,
  onDismissError,
}: StartScreenProps) {
  const { status, errorMessage, currentSlot, connect } = midiDevice;
  const {
    busy,
    connected,
    webMidiSupported,
    label: connectLabel,
    hint: connectHint,
  } = useConnectCta(midiDevice);

  const slotLabel = currentSlot !== null ? SysExCodec.slotToLabel(currentSlot) : null;
  const deviceName = currentSlot !== null ? midiDevice.presetNames[currentSlot] : null;

  return (
    <div className="start-view">
      <div className="start-wrap">
        {/* The chain, in the board's own colours. Each block carries its full
            name AND its initial; CSS picks one, because eleven three-letter
            blocks and ten arrows stop fitting a line somewhere around 700px
            and a strip that wraps stops reading as a signal chain. */}
        <div className="start-chain" aria-hidden="true">
          {SLOT_MODULES.map((mod) => (
            <span key={mod} className="start-blk-wrap">
              <span className="start-blk" style={{ color: DEFAULT_KEY[mod] ?? '#c9d1d9' }}>
                <span className="start-blk-full">{mod}</span>
                <span className="start-blk-short">{mod.charAt(0)}</span>
              </span>
            </span>
          ))}
        </div>

        {/* The fork's own mark, not upstream's GP-200 unit — public/favicon.svg
            says as much, and the unit is the skeuomorphism this skin does away
            with. Same path the favicon draws, in the screen's own accent: the
            shape is the identity, and the blue already shifts with the theme's
            brightness filter. */}
        <svg className="start-mark" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M9.2 1.8 3.8 9h4.1l-1.1 5.2L12.2 7H8.1z" fill="currentColor" />
        </svg>

        <h1 className="start-title">
          ITZA GP-200 STUDIO
          {__APP_VERSION__ && (
            <span className="start-ver" title={`Commit ${__APP_VERSION__.commit}`}>
              {__APP_VERSION__.label}
            </span>
          )}
        </h1>
        <p className="start-sub">Valeton GP-200 pedalboard editor &amp; loop station</p>

        <div className="start-actions">
          <div className="start-card lit">
            {connected ? (
              <button type="button" className="start-btn primary" onClick={onOpenCurrent}>
                <span className="start-btn-row">
                  <span className="start-led on" aria-hidden="true" />
                  OPEN CURRENT PRESET
                </span>
                {slotLabel && (
                  <span className="start-btn-sub">
                    Slot {slotLabel}{deviceName ? ` »${deviceName}«` : ''}
                  </span>
                )}
              </button>
            ) : (
              <button
                type="button"
                className="start-btn primary"
                disabled={busy || !webMidiSupported}
                onClick={() => void connect()}
              >
                <span className="start-btn-row">
                  <span className={`start-led${busy ? ' busy' : ''}`} aria-hidden="true" />
                  {connectLabel}
                </span>
                {connectHint && <span className="start-btn-sub">{connectHint}</span>}
              </button>
            )}

            {status === 'error' && errorMessage && (
              <p className="start-msg error" role="alert">{errorMessage}</p>
            )}
            {loadError && (
              <p className="start-msg error" role="alert">
                {loadError}
                <button type="button" onClick={onDismissError} aria-label="Dismiss error">✕</button>
              </p>
            )}
            {!webMidiSupported && (
              <p className="start-msg">
                Web MIDI is not available in this browser; use Chrome or Edge to connect a
                device. You can still open the editor and export presets.
              </p>
            )}
            {!connected && webMidiSupported && status !== 'error' && (
              <p className="start-msg">
                Plug the GP-200 into your computer over USB and power it on, then click the
                button above.
              </p>
            )}
          </div>

          {/* Kept at exactly this accessible name: scripts/capture-guide-shots.mjs
              clicks it by role to get past this page before photographing every
              other surface in the app. */}
          <button type="button" className="start-btn" onClick={onOpenBlank}>
            OPEN WITHOUT CONNECTING
            <span className="start-btn-sub">no pedal needed · blank preset</span>
          </button>
        </div>

        <ul className="start-features">
          {FEATURES.map((feature) => (
            <li key={feature.text} className="start-feature">
              <i className="start-tri" style={{ color: feature.color }} aria-hidden="true" />
              {feature.text}
            </li>
          ))}
        </ul>

        {/* <details> rather than a React toggle: this page is prerendered and
            must read with JavaScript off, and the open/closed state, the
            keyboard handling and the screen-reader announcement all come free. */}
        <details className="start-why">
          <summary>Why ITZA GP-200</summary>
          <p className="start-why-text">
            ITZA GP-200 is an ongoing user interface expansion of the GP200Studio.com web
            app for the Valeton GP200 guitar multi-fx pedal. Building upon the expanded
            Patch Management features, this release rebuilds the pedalboard as cards you
            can colour, lock and re-style, and makes the FX loop something you move rather
            than something you read. Designed and built for Windows 11 running Chrome.
            You&apos;ll need a USB cable to connect your GP-200 to your computer.
          </p>
        </details>

        {/* Not the shared <Credits/>: this screen names kabir0st's own pages
            rather than his personal links, because someone arriving here wants
            the app and the guide. The byline and the licence stay, because the
            attribution is the point and GPL-3.0 is a condition of it. */}
        <p className="start-credit">
          <a href="https://gp200studio.com" target="_blank" rel="noopener noreferrer">
            GP200 Studio
          </a>
          <span className="start-sep" aria-hidden="true">|</span>
          <a href="https://github.com/kabir0st/gp200-studio" target="_blank" rel="noopener noreferrer">
            Original by Kabir Tamari
          </a>
          <span className="start-sep" aria-hidden="true">|</span>
          <a href="https://gp200studio.com/guide" target="_blank" rel="noopener noreferrer">
            Read the guide
          </a>
          <span className="start-credit-line">
            ITZA GP-200 is an independent fork · free &amp; open source (GPL-3.0)
          </span>
        </p>
      </div>
    </div>
  );
}
