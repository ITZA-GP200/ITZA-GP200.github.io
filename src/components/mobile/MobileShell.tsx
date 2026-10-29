import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PedalBoardProps } from '@/components/board/PedalBoard';
// The phone shell is a separate tree from the board, so it loads the skin
// itself; CSS is global once imported either way.
import '@/components/board/skin-itza.css';
import { EffectPicker } from '@/components/board/EffectPicker';
import { getSlotModule } from '@/core/effectNames';
import {
  FX_RETURN_COLOR,
  FX_SEND_COLOR,
  keyColorFor,
  LABEL_LUM_DEFAULT,
} from '@/core/boardSkin';
import { usePedalManifest } from '@/components/board/pedalManifest';
import { LooperPanel } from '@/components/board/LooperPanel';
import { DrumsPanel } from '@/components/board/DrumsPanel';
import { DeviceLooperPanel } from '@/components/board/DeviceLooperPanel';
import { BulkApplySection } from '@/components/BulkApplySection';
import { DrumMachinePanel } from '@/components/board/DrumMachinePanel';
import { FxLoopArrows } from '@/components/FxLoopArrows';
import { FxScenarioPicker } from '@/components/FxScenarioPicker';
import { PatchDetailsPanel } from '@/components/PatchDetailsPanel';
import { ControllerPanel } from '@/components/ControllerPanel';
import { FootswitchPanel } from '@/components/FootswitchPanel';
import { Tabs } from '@/components/ui/Tabs';
import { MobileHeader } from './MobileHeader';
import { MobileTabBar, type MobileTab } from './MobileTabBar';
import { MobileSheet } from './MobileSheet';
import { CableDefs } from './ChainCable';
import { MobileRack } from './MobileRack';
import { ChainScreen } from './ChainScreen';
import { DeviceScreen } from './DeviceScreen';
import { track } from '@/core/analytics';
import './mobile.css';
import './pedals.css';

type Sheet = 'fxloop' | 'patch' | 'meta' | null;

type PatchSettingsTab = 'details' | 'exp' | 'ctrl' | 'bulk';

const PATCH_SETTINGS_TABS = [
  { id: 'details', label: 'Details' },
  { id: 'exp', label: 'Expression' },
  { id: 'ctrl', label: 'Footswitches' },
  { id: 'bulk', label: 'Bulk Apply' },
];

/**
 * Root of the phone tree, rendered below 640px in place of PedalBoard.
 *
 * Takes PedalBoardProps verbatim: App builds one props object and spreads it
 * into whichever tree renders, so a new editor capability cannot reach the
 * board and silently skip the phone. Props are destructured explicitly (never
 * `...rest`) so anything this tree ignores is visible in review.
 *
 * Crossing the 640px boundary unmounts one tree and mounts the other. Preset,
 * MIDI session, looper and audio state all live in App/hooks and survive; only
 * ephemeral UI state (active tab, open sheet) resets. That is deliberate —
 * debouncing the breakpoint would reintroduce mid-resize flicker.
 *
 * Ignored on purpose: dragIndex / dragOverIndex / onDragStart / onDragOver /
 * onDrop. Those drive HTML5 drag-and-drop, which never fires on touch; reorder
 * here goes through onMove.
 */
export default function MobileShell({
  preset,
  onToggle,
  onChangeEffect,
  onParamChange,
  onMove,
  patchVolume,
  patchPan,
  patchTempo,
  currentSlot,
  connected,
  onLoadRequest,
  onSaveToActiveSlot,
  onPatchNameChange,
  onAuthorChange,
  onVolumeChange,
  onPanChange,
  onTempoChange,
  onCloseRequest,
  onFxSendChange,
  onFxReturnChange,
  onApplyFxScenario,
  onFxModeChange,
  deviceModel,
  onDeviceModelChange,
  onStyleChange,
  onNoteChange,
  onExpParamSelect,
  onExpMinMax,
  onCtrlBlockToggle,
  onCtrlClear,
  onOpenPatchManager,
  onActivateSlot,
  onOpenGuide,
  onPanelOpen,
  looper,
  looperTempo,
  looperBindings,
  onLooperBindingsChange,
  onEnableAudio,
  audioStarting,
  onLooperDrawerOpenChange,
  looperTriggers,
  looperArmedAction,
  onLooperArmLearn,
  onLooperClearTrigger,
  onLooperClearAll,
  looperLearnNotice,
  drumMachine,
  sendCC,
  deviceState,
  canCopyCtrl,
  onBulkApply,
  bulkApplyProgress,
  onCancelBulkApply,
  ccChannel,
  onCcChannelChange,
  theme,
  onToggleTheme,
  soundOn,
  onToggleSound,
  onConnectRequest,
  onDisconnect,
  onPushRequest,
  pushProgress,
  firmware,
  boardSkin = {},
  boardStyle = 'dial',
  onBlockSkinChange,
  onBoardStyleChange,
  labelLum = LABEL_LUM_DEFAULT,
  onLabelLumChange,
}: PedalBoardProps) {
  const [tab, setTab] = useState<MobileTab>('chain');
  // Which block's effect browser is open, from a tap on a chain card. The
  // board opens the same picker from the pedal's name button.
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [patchTab, setPatchTab] = useState<PatchSettingsTab>('exp');

  function selectPatchTab(id: string) {
    if (id === 'exp' || id === 'ctrl' || id === 'bulk') {
      setPatchTab(id);
    }
  }
  /** array position of the block being edited, or null for the chain list */
  const artIndex = usePedalManifest();
  /** the scrolling region, so a chain drag near the edge can auto-scroll it */
  const mainRef = useRef<HTMLElement>(null);

  // Stomp hijacking + the footswitch takeover are only safe while the looper is
  // actually on screen; on the phone that's the LOOP tab, not a dialog.
  useEffect(() => {
    onLooperDrawerOpenChange(tab === 'loop');
  }, [tab, onLooperDrawerOpenChange]);

  // The Patches tab is a launcher for the shared patch manager sheet, which
  // App owns; bounce back to Chain so the tab never sits on an empty screen.
  useEffect(() => {
    if (tab !== 'patches') return;
    onOpenPatchManager();
    setTab('chain');
  }, [tab, onOpenPatchManager]);

  // Every sheet opens through here, mirroring PedalBoard's openPanel, so the
  // phone can't drift out of the shared PanelId vocabulary.
  const openSheet = useCallback(
    (next: Exclude<Sheet, null>) => {
      setSheet(next);
      if (next === 'meta') {
        onPanelOpen('patch_meta');
        return;
      }
      onPanelOpen(next);
    },
    [onPanelOpen],
  );

  // Tab changes are the phone's entire navigation model. LOOP and DRUMS are the
  // same features the desktop hides behind drawers, so they also report
  // panel_open , that is what keeps "did anyone find the looper?" a single
  // number across both trees instead of two that can't be added together.
  const tabSettled = useRef(false);
  useEffect(() => {
    // Skip the mount render: landing on the default CHAIN tab isn't navigation.
    if (!tabSettled.current) {
      tabSettled.current = true;
      return;
    }
    track('nav_tab', { tab });
    if (tab === 'loop') onPanelOpen('looper');
    if (tab === 'drums') onPanelOpen('drums');
  }, [tab, onPanelOpen]);


  return (
    // The board's grey, published once on the shell so every card, chip and
    // tool icon below derives from it.
    <div
      className="mobile-view"
      data-skin={onBlockSkinChange ? 'itza' : undefined}
      style={{
        '--pk-label-l': `${labelLum}%`,
        // The drop line is drawn by a row's ::after, which cannot read a
        // colour from the marker being dragged — so both live on the shell.
        '--fx-send': FX_SEND_COLOR,
        '--fx-return': FX_RETURN_COLOR,
      } as CSSProperties}
    >
      {/* one copy of the cable gradients for every cable on the chain screen */}
      <CableDefs />

      <MobileHeader
        connected={connected}
        patchName={preset.patchName}
        currentSlot={currentSlot}
        pushProgress={pushProgress}
        onActivateSlot={onActivateSlot}
        onEditMeta={() => openSheet('meta')}
      />

      <main className="m-main" ref={mainRef}>
        {tab === 'chain' && (
          <ChainScreen
            preset={preset}
            artIndex={artIndex}
            scrollRef={mainRef}
            onToggle={onToggle}
            onMove={onMove}
            onOpenFxLoop={() => openSheet('fxloop')}
            skinned={Boolean(onBlockSkinChange)}
            boardSkin={boardSkin}
            boardStyle={boardStyle}
            onParamChange={onParamChange}
            onOpenPicker={setPickerSlot}
            onBlockSkinChange={onBlockSkinChange}
            // The same two callbacks the loop panel uses, so the push that
            // keeps send <= return applies to a drag exactly as it does there.
            onFxPositionChange={(kind, position) =>
              (kind === 'send' ? onFxSendChange : onFxReturnChange)(position)
            }
            labelLum={labelLum}
            onLabelLumChange={onLabelLumChange}
          />
        )}

        {tab === 'loop' && (
          <div className="m-screen">
            <MobileRack title="Loop Station">
              <LooperPanel
                looper={looper}
                tempo={looperTempo}
                bindings={looperBindings}
                onBindingsChange={onLooperBindingsChange}
                onEnableAudio={onEnableAudio}
                audioStarting={audioStarting}
                triggers={looperTriggers}
                armedAction={looperArmedAction}
                onArmLearn={onLooperArmLearn}
                onClearTrigger={onLooperClearTrigger}
                onClearAll={onLooperClearAll}
                learnNotice={looperLearnNotice}
                learnEnabled={connected}
              />
            </MobileRack>
            {/* The pedal's own single loop, racked under the loop station */}
            <MobileRack title="GP-200 Loop">
              <DeviceLooperPanel connected={connected} sendCC={sendCC} />
            </MobileRack>
          </div>
        )}

        {tab === 'drums' && (
          <div className="m-screen">
            <MobileRack title="Practice Drums">
              <DrumMachinePanel drums={drumMachine} />
            </MobileRack>
            <MobileRack title="GP-200 Drums &amp; Tuner">
              <DrumsPanel
                connected={connected}
                sendCC={sendCC}
                ccChannel={ccChannel}
                onCcChannelChange={onCcChannelChange}
              />
            </MobileRack>
          </div>
        )}

        {tab === 'device' && (
          <>
            {/* The desktop board wears the red rocker on its chassis rail; the
                phone has no chassis, so the same theme toggle lives in the
                DEVICE tab as a plain mobile button (the rocker's skin is
                .board-view-scoped, and the phone tree does not restyle
                borrowed chrome — it borrows whole components or nothing). */}
            <div className="m-screen pb-0">
              <h2 className="m-screen-title">STAGE LIGHTS</h2>
              <button
                type="button"
                role="switch"
                aria-checked={theme === 'light'}
                className={`m-btn wide${theme === 'light' ? ' active' : ''}`}
                onClick={onToggleTheme}
              >
                {theme === 'light' ? '☀ LIGHTS ON' : '☾ DARK STAGE'}
              </button>
              {/* The clack the toggle above makes (src/lib/uiSound.ts). The
                  desktop hides this behind an icon next to the rocker; here it
                  reads as a second labelled row, which is all the phone has. */}
              <button
                type="button"
                role="switch"
                aria-checked={soundOn}
                className={`m-btn wide${soundOn ? ' active' : ''}`}
                onClick={onToggleSound}
              >
                {soundOn ? '♪ SWITCH SOUND ON' : '✕ SWITCH SOUND MUTED'}
              </button>
            </div>
            <DeviceScreen
              skinned={Boolean(onBlockSkinChange)}
              connected={connected}
              firmware={firmware}
              currentSlot={currentSlot}
              patchVolume={patchVolume}
              patchPan={patchPan}
              patchTempo={patchTempo}
              onVolumeChange={onVolumeChange}
              onPanChange={onPanChange}
              onTempoChange={onTempoChange}
              onConnectRequest={onConnectRequest}
              onDisconnect={onDisconnect}
              onLoadRequest={onLoadRequest}
              onPushRequest={onPushRequest}
              onSaveToActiveSlot={onSaveToActiveSlot}
              onOpenFxLoop={() => openSheet('fxloop')}
              onOpenPatchSettings={() => openSheet('patch')}
              onOpenGuide={onOpenGuide}
              onCloseRequest={onCloseRequest}
              sendCC={sendCC}
              deviceState={deviceState}
            />
          </>
        )}
      </main>

      <MobileTabBar
        active={tab}
        onChange={setTab}
        boardStyle={boardStyle}
        onBoardStyleChange={onBoardStyleChange}
      />

      {/* One sheet depth maximum: Dialog locks page scroll, and stacking two
          double-fires the restore. */}
      <MobileSheet open={sheet === 'meta'} onClose={() => setSheet(null)} title="Patch">
        <label className="m-field">
          <span className="m-field-label">NAME</span>
          <input
            className="m-input"
            value={preset.patchName}
            maxLength={16}
            onChange={(e) => onPatchNameChange(e.target.value)}
          />
        </label>
        <label className="m-field">
          <span className="m-field-label">AUTHOR</span>
          <input
            className="m-input"
            value={preset.author}
            maxLength={16}
            onChange={(e) => onAuthorChange(e.target.value)}
          />
        </label>
      </MobileSheet>

      <MobileSheet open={sheet === 'fxloop'} onClose={() => setSheet(null)} title="FX Loop">
        <FxLoopArrows
          send={preset.fxLoopSend}
          ret={preset.fxLoopReturn}
          onSendChange={onFxSendChange}
          onReturnChange={onFxReturnChange}
        />
        <div className="mt-4">
          <FxScenarioPicker
            preset={preset}
            onApply={onApplyFxScenario}
            onModeChange={onFxModeChange}
          />
        </div>
      </MobileSheet>

      {/* One per-patch settings sheet, mirroring the desktop PATCH SETTINGS
          drawer's tabs: EXP assignment (+ live test row), CTRL footswitch
          masks, bulk apply. */}
      <MobileSheet open={sheet === 'patch'} onClose={() => setSheet(null)} title="Patch Settings">
        <Tabs
          tabs={PATCH_SETTINGS_TABS}
          active={patchTab}
          ariaLabel="Patch settings sections"
          onSelect={selectPatchTab}
        />
        <div role="tabpanel" className="pt-4">
          {patchTab === 'details' && (
            <PatchDetailsPanel
              preset={preset}
              onStyleChange={onStyleChange}
              onNoteChange={onNoteChange}
            />
          )}
          {patchTab === 'exp' && (
            <ControllerPanel
              preset={preset}
              connected={connected}
              onParamSelect={onExpParamSelect}
              onMinMax={onExpMinMax}
              sendCC={sendCC}
            />
          )}
          {patchTab === 'ctrl' && (
            <FootswitchPanel
              preset={preset}
              connected={connected}
              onCtrlBlockToggle={onCtrlBlockToggle}
              onCtrlClear={onCtrlClear}
              deviceModel={deviceModel}
              onDeviceModelChange={onDeviceModelChange}
            />
          )}
          {patchTab === 'bulk' && (
            <BulkApplySection
              connected={connected}
              canCopyCtrl={canCopyCtrl}
              progress={bulkApplyProgress}
              onApply={onBulkApply}
              onCancel={onCancelBulkApply}
            />
          )}
        </div>
      </MobileSheet>

      {/* The chain card's effect browser — the same picker the board opens
          from a pedal's name. */}
      {pickerSlot !== null && (
        <EffectPicker
          open
          module={getSlotModule(pickerSlot)}
          currentEffectId={preset.effects.find((e) => e.slotIndex === pickerSlot)?.effectId ?? 0}
          artIndex={artIndex}
          onSelect={(effectId) => {
            onChangeEffect(pickerSlot, effectId);
            setPickerSlot(null);
          }}
          onClose={() => setPickerSlot(null)}
          accentOverride={
            onBlockSkinChange ? keyColorFor(boardSkin, pickerSlot, getSlotModule(pickerSlot)) : undefined
          }
        />
      )}
    </div>
  );
}
