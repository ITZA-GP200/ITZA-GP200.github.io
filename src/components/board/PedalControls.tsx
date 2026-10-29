import type { EffectSlot } from '@/core/types';
import { getEffectParams } from '@/core/effectParams';
import { isKnobSynced } from '@/core/tempoSync';
import type { BodySpec } from './boardPalette';
import { PedalKnob } from './PedalKnob';
import { PedalFader } from './PedalFader';
import { PedalBar } from './PedalBar';
import { ComboSelect, MiniSwitch } from './MiniSwitch';

interface PedalControlsProps {
  slot: EffectSlot;
  /** for every control's accessible name, e.g. "Green OD Gain" */
  effectName: string;
  spec: BodySpec;
  /** knob cap ink: the amp panel's text colour where there is one */
  knobInk: string;
  onParamChange: (paramIdx: number, value: number) => void;
  /** values are frozen (ITZA skin's per-block lock) */
  locked?: boolean;
  /** draw knobs as value arcs (ITZA skin) rather than capped knobs */
  arc?: boolean;
  /** draw knob params as bars (ITZA skin, bar style) */
  bars?: boolean;
  /** draw knob params as vertical faders (stock board's graphic EQ) */
  faders?: boolean;
}

/**
 * One block's controls, in the order the effect declares them.
 *
 * Shared by the board's pedal and the phone's expanded card so the two can
 * never drift: the same knobs, the same switches, the same lock, the same
 * accessible names, whichever shell is drawing them.
 */
export function PedalControls({
  slot,
  effectName,
  spec,
  knobInk,
  onParamChange,
  locked = false,
  arc = false,
  bars = false,
  faders = false,
}: PedalControlsProps) {
  const change = (idx: number) => (value: number) => {
    if (!locked) onParamChange(idx, value);
  };

  return (
    <>
      {getEffectParams(slot.effectId).map((def) => {
        const value = slot.params[def.idx] ?? def.default;
        // Two defs can share an idx (generated table quirk: Slapback's
        // Sync + Trail both map param 3), so the key needs the name too.
        const defKey = `${def.idx}-${def.name}`;
        if (def.type === 'knob') {
          if (bars) {
            return (
              <PedalBar
                key={defKey}
                param={def}
                value={value}
                onChange={change(def.idx)}
                pedalName={effectName}
              />
            );
          }
          if (faders) {
            return (
              <PedalFader
                key={defKey}
                param={def}
                value={value}
                onChange={change(def.idx)}
                pedalName={effectName}
              />
            );
          }
          return (
            <PedalKnob
              key={defKey}
              param={def}
              value={value}
              onChange={change(def.idx)}
              knobStyle={spec.knob}
              ink={knobInk}
              arc={arc}
              pedalName={effectName}
              synced={isKnobSynced(slot.effectId, def, slot.params)}
            />
          );
        }
        if (def.type === 'switch') {
          return (
            <MiniSwitch
              key={defKey}
              param={def}
              value={value}
              onChange={change(def.idx)}
              pedalName={effectName}
            />
          );
        }
        return (
          <ComboSelect
            key={defKey}
            param={def}
            value={value}
            onChange={change(def.idx)}
            pedalName={effectName}
          />
        );
      })}
    </>
  );
}
