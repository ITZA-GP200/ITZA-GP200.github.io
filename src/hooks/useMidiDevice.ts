import { useState, useRef, useCallback, useEffect } from 'react';
import { SysExCodec, type DeviceStateDump } from '@/core/SysExCodec';
import { decodeControlChange } from '@/core/midiControlMap';
import {
  isAssignmentDumpEnabled,
  isMidiMonitorEnabled,
  isNameWriteEnabled,
} from '@/core/debugFlags';
import { hexOfBytes } from '@/core/looperTriggers';
import type { GP200Preset } from '@/core/types';
import type { CCCommand } from '@/core/ccControl';
import { presetNameCacheKey, loadCachedNames, saveCachedNames } from '@/core/presetNameCache';
import type { BulkApplyOptions, BulkApplyProgress } from '@/core/bulkApply';
import { track } from '@/core/analytics';
import { PRSTEncoder } from '@/core/PRSTEncoder';
import { describePatchDifferences } from '@/core/samePatch';
import {
  describeHandshakeSilence,
  describeMidiAccessDenied,
  describeMissingDevice,
  describeSysexDenied,
} from '@/core/midiPortDiagnostics';
import { useMidiSend } from './useMidiSend';

const READ_TIMEOUT_MS = 3000;

function isSysEx(data: Uint8Array, cmd: number, sub: number): boolean {
  return (
    data.length > 10 &&
    data[0] === 0xF0 &&
    data[1] === 0x21 && data[2] === 0x25 && data[3] === 0x7E &&
    data[4] === 0x47 && data[5] === 0x50 && data[6] === 0x2D && data[7] === 0x32 &&
    data[8] === cmd && data[9] === sub
  );
}

/** Safely extract a Uint8Array from a MIDI message event's data field.
 *  The real MIDIMessageEvent.data is Uint8Array; our mock also passes a Uint8Array. */
function getBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof DataView) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data as ArrayBuffer);
}

/** A real MIDIPort types `name` as `string | null`; our mocks match it. */
function portName(port: unknown): string | null {
  return (port as { name: string | null }).name;
}

/** The GP-200 identifies itself by name on every platform we support. */
function isGP200Port(port: unknown): boolean {
  const name = portName(port);
  return typeof name === 'string' && name.includes('GP-200');
}

/** `navigator.userAgent`, or '' under the prerender's bare Node environment. */
function currentUserAgent(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent;
}

/**
 * Whether this is Brave.
 *
 * Brave ships Chrome's user-agent string byte for byte, so the injected
 * `navigator.brave` object is the only tell, and it answers asynchronously.
 * Called on the failure paths only: a connect that works must not pay for a
 * question that only changes the wording of an error.
 */
async function detectBrave(): Promise<boolean> {
  const { brave } = navigator as { brave?: { isBrave?: () => Promise<boolean> } };
  if (!brave?.isBrave) return false;
  try {
    return await brave.isBrave();
  } catch {
    return false;
  }
}

/**
 * requestMIDIAccess, with the browser's two refusals turned into advice.
 *
 * Both are otherwise dead ends. A stored Block stops the browser prompting at
 * all, so the failure is instant, popup-less, and explained only by a
 * DOMException that does not say where the switch is; and an access granted
 * without SysEx looks like a total success right up until the handshake times
 * out twice for no visible reason. Checking sysexEnabled turns the second one
 * into a one-second failure with a fix in it.
 */
async function requestGP200Access(): Promise<GP200Access> {
  if (!('requestMIDIAccess' in navigator)) {
    throw new Error('Web MIDI API not supported in this browser');
  }
  const midiNavigator = navigator as unknown as {
    requestMIDIAccess: (opts: { sysex: boolean }) => Promise<GP200Access>;
  };
  let access: GP200Access;
  try {
    access = await midiNavigator.requestMIDIAccess({ sysex: true });
  } catch (err) {
    // Only the permission refusals get reworded; AbortError and friends mean
    // something else entirely and keep their own message.
    const { name } = err as { name?: string };
    if (name !== 'SecurityError' && name !== 'NotAllowedError') throw err;
    const message = describeMidiAccessDenied({ isBrave: await detectBrave() });
    throw new Error(message, { cause: err });
  }
  if (!access.sysexEnabled) {
    throw new Error(describeSysexDenied({ isBrave: await detectBrave() }));
  }
  return access;
}

/**
 * The message for a handshake that started and then failed.
 *
 * A timeout here is the costliest failure in the app: both ports opened, so
 * every "GP-200 not found" hint is wrong, and "Response timeout" alone names
 * none of the causes that actually explain it. Anything that is not a timeout
 * already carries its own message and keeps it.
 */
async function describeHandshakeFailure(err: unknown, sawAnyBytes: boolean): Promise<string> {
  if (!(err instanceof Error)) return 'Handshake failed';
  if (!/timeout/i.test(err.message)) return err.message;
  return describeHandshakeSilence({
    userAgent: currentUserAgent(),
    isBrave: await detectBrave(),
    sawAnyBytes,
  });
}

export interface UseMidiDeviceReturn {
  status: 'disconnected' | 'connecting' | 'handshaking' | 'connected' | 'error';
  handshakeStep: string | null;
  errorMessage: string | null;
  deviceName: string | null;
  currentSlot: number | null;
  presetNames: (string | null)[];
  namesLoadProgress: number;
  /** True while the background re-scan is verifying cache-seeded names against
   *  the device. Distinct from namesLoadProgress (which drives the first-load bar). */
  namesSyncing: boolean;
  deviceInfo: { deviceType: number; firmwareValues: number[]; versionAccepted: boolean } | null;
  currentPreset: GP200Preset | null;
  /** User-IR slot names enumerated during the handshake (0x11/0x1C query →
   *  0x12/0x1C response; re-identified 2026-08-08 as User-IR enumeration, see
   *  docs/protocol-capture.md §3). 30 entries in device slot order; empty
   *  array until the sweep runs (or when the device didn't answer). */
  userIrNames: string[];
  /** Typed view of the connect-time 0x4E state dump (tuner A4, global-EQ
   *  floats, drum style-group names, raw TLV records). Null until the
   *  handshake completes; see DeviceStateDump for per-field caveats. */
  deviceState: DeviceStateDump | null;

  connect: () => Promise<void>;
  disconnect: () => void;
  loadPresetNames: () => Promise<void>;
  /** Force re-read every slot and correct any that drifted from the cache-seeded
   *  values, persisting the result. Runs silently in the background after connect. */
  syncPresetNames: () => Promise<void>;
  /** Clear cached names (except the already-pulled current bank) and re-enumerate. */
  refreshNames: () => Promise<void>;
  pullPreset: (slot: number) => Promise<GP200Preset>;
  pushPreset: (preset: GP200Preset, slot: number) => Promise<void>;
  /** Copy one slot into another on the pedal itself (no patch data sent).
   *  `copied` is what COPY read from the source; nothing is written if the
   *  source no longer holds it. Reads the target back and resolves with what
   *  it holds, or throws when the pedal didn't take the copy. */
  copySlotOnDevice: (fromSlot: number, toSlot: number, copied: GP200Preset) => Promise<GP200Preset>;
  writePresetToSlot: (preset: GP200Preset, slot: number) => Promise<void>;
  saveToSlot: (presetName: string, slot?: number) => Promise<void>;
  /** Rename a slot without touching its effect data. Briefly switches the
   *  device to the target slot (required to load the editing buffer), then
   *  save-commits under the new name and restores the previous slot. */
  renameSlot: (slot: number, name: string) => Promise<void>;
  /** Write the same CTRL assignments and/or patch volume into every listed
   *  slot (preset-change → live writes → save-commit per slot). Progress in
   *  bulkApplyProgress; cancel with cancelBulkApply (finishes current slot). */
  bulkApply: (
    slots: number[],
    options: BulkApplyOptions,
  ) => Promise<{ done: number; cancelled: boolean }>;
  bulkApplyProgress: BulkApplyProgress | null;
  cancelBulkApply: () => void;
  sendToggle: (blockIndex: number, enabled: boolean) => void;
  sendParamChange: (blockIndex: number, paramIndex: number, effectId: number, value: number) => void;
  sendReorder: (order: number[], send: number, ret: number) => void;
  sendFxLoopMove: (order: number[], send: number, ret: number, which: 'send' | 'return') => void;
  sendSlotChange: (slot: number) => void;
  sendAuthor: (author: string) => void;
  sendStyleName: (styleName: string) => void;
  sendNote: (note: string) => void;
  sendEffectChange: (blockIndex: number, effectId: number) => void;
  sendPatchVolume: (value: number) => void;
  sendPatchPan: (deviceValue: number) => void;
  sendPatchTempo: (bpm: number) => void;
  sendRawChunks: (chunks: Uint8Array[], delayMs: number, onProgress?: (i: number, total: number) => void) => Promise<void>;
  sendExpParamSelect: (page: number, item: number, blockIndex: number, paramIdx: number) => void;
  sendExpMinMax: (page: number, item: number, min: number, max: number) => void;
  /** Per-patch CTRL footswitch → effect-block mask (whole mask, not per-bit). */
  sendCtrlAssignment: (ctrlIndex: number, blockMask: number, state?: number) => void;
  // Device-global settings (0x12/0x08 settings-write family, docs §0.2)
  sendFsMode: (mode: number) => void;
  sendFsTarget: (fs: number, kind: 'tap' | 'hold', actionId: number) => void;
  sendFsCombo: (comboIndex: number, actionId: number) => void;
  sendAutoCabMatch: (on: boolean) => void;
  // Plain MIDI CC (built-in looper / drums / tuner; src/core/ccControl.ts)
  sendCC: (command: CCCommand | CCCommand[]) => void;
  ccChannel: number;
  setCcChannel: (channel: number) => void;
  setOnDeviceChange: (cb: ((slot: number | null) => void) | null) => void;
  setOnDeviceToggle: (cb: ((blockIndex: number, enabled: boolean) => void) | null) => void;
  // Callback returns whether the change was applied (drives FX-state suppression)
  setOnDeviceEffectChange: (cb: ((blockIndex: number, effectId: number) => boolean) | null) => void;
  setOnDeviceParamChange: (cb: ((blockIndex: number, paramIndex: number, value: number) => void) | null) => void;
  // Real-time hardware controls for the loop station (wire format pending capture)
  setOnFootswitch: (cb: ((fsNumber: number, state: boolean) => void) | null) => void;
  setOnExpPosition: (cb: ((value: number) => void) | null) => void;
  // Raw-frame tap: the looper's MIDI-learn/hijack path. Runs before every
  // dispatcher branch; a true return consumes the frame.
  setOnLooperFrameTap: (
    cb:
      | ((data: Uint8Array, ctx: { suppressed: boolean; currentSlot: number | null }) => boolean)
      | null,
  ) => void;
}

// Minimal shape we actually use; avoids conflicts with DOM's MIDIInput / MIDIOutput
interface GP200Input {
  name: string | null;
  onmidimessage: ((event: { data: unknown }) => void) | null;
}
interface GP200Output {
  send: (data: Uint8Array | number[]) => void;
}
interface GP200Access {
  inputs: { values: () => Iterable<GP200Input> };
  outputs: { values: () => Iterable<GP200Output> };
  /** A browser can grant plain MIDI and withhold System Exclusive. Every frame
   *  this app sends or expects is SysEx, so a false here is fatal, silently. */
  sysexEnabled: boolean;
}

function waitForResponse(
  input: GP200Input,
  match: (data: Uint8Array) => boolean,
  timeoutMs: number,
  baseHandler: (event: { data: unknown }) => void,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      input.onmidimessage = baseHandler;
      reject(new Error('Response timeout'));
    }, timeoutMs);
    input.onmidimessage = (event: { data: unknown }) => {
      const data = getBytes(event.data);
      baseHandler(event);
      if (match(data)) {
        clearTimeout(timer);
        input.onmidimessage = baseHandler;
        resolve(data);
      }
    };
  });
}

function collectChunks(
  input: GP200Input,
  cmd: number,
  sub: number,
  expectedCount: number,
  timeoutMs: number,
  baseHandler: (event: { data: unknown }) => void,
): Promise<Uint8Array[]> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const timer = setTimeout(() => {
      input.onmidimessage = baseHandler;
      reject(new Error('Chunk collection timeout'));
    }, timeoutMs);
    input.onmidimessage = (event: { data: unknown }) => {
      const data = getBytes(event.data);
      baseHandler(event);
      if (isSysEx(data, cmd, sub)) {
        chunks.push(new Uint8Array(data));
        if (chunks.length === expectedCount) {
          clearTimeout(timer);
          input.onmidimessage = baseHandler;
          resolve(chunks);
        }
      }
    };
  });
}

export function useMidiDevice(): UseMidiDeviceReturn {
  const [status, setStatus] = useState<UseMidiDeviceReturn['status']>('disconnected');
  // Synchronous mirror of `status` for callbacks that must not re-create when it
  // changes (connect is memoised on [] and would otherwise read a stale value).
  const statusRef = useRef(status);
  statusRef.current = status;
  const [handshakeStep, setHandshakeStep] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [currentSlot, setCurrentSlot] = useState<number | null>(null);
  const [presetNames, setPresetNames] = useState<(string | null)[]>(new Array(256).fill(null));
  const [namesLoadProgress, setNamesLoadProgress] = useState(0);
  const [namesSyncing, setNamesSyncing] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<UseMidiDeviceReturn['deviceInfo']>(null);
  const [currentPreset, setCurrentPreset] = useState<GP200Preset | null>(null);
  const wasConnectedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [userIrNames, setUserIrNames] = useState<string[]>([]);
  const [deviceState, setDeviceState] = useState<DeviceStateDump | null>(null);

  const outputRef          = useRef<GP200Output | null>(null);
  const inputRef           = useRef<GP200Input | null>(null);
  const presetNamesRef     = useRef<(string | null)[]>(new Array(256).fill(null));
  const currentSlotRef     = useRef<number | null>(null);
  const namesLoadAbortRef  = useRef<boolean>(false);
  const namesLoadRunningRef = useRef<boolean>(false);
  // localStorage cache key for this device's slot names (deviceType + port name),
  // computed during the handshake. null until connected / storage unavailable.
  const cacheKeyRef        = useRef<string | null>(null);
  // While a flash push bounces the device across slots (park → write →
  // return), the device echoes each hop as a preset-change frame. Acting on
  // those would pull the park slot into the editor mid-save; ignore echoes
  // until this timestamp.
  const suppressSlotEchoUntilRef = useRef(0);
  // Whether ANY byte has arrived from the device since CONNECT was pressed.
  // The only thing that separates "another program owns this port" from "the
  // pedal answered, just not with what we asked for" when a handshake step
  // times out; see describeHandshakeSilence in core/midiPortDiagnostics.ts.
  const sawDeviceBytesRef = useRef(false);

  // Delegate all send operations, device-initiated callback registration,
  // and FX-state echo suppression to useMidiSend. The parent hook keeps
  // connection state + preset ops; useMidiSend owns everything else we
  // send to or receive from the pedal.
  //
  // onSlotChange keeps the local currentSlot state in sync whenever the
  // user triggers a slot change via sendSlotChange; previously that was
  // done inline at the end of the send callback.
  const send = useMidiSend({
    outputRef,
    onSlotChange: (slot) => {
      setCurrentSlot(slot);
      currentSlotRef.current = slot;
    },
  });
  const {
    deviceCallbacks: {
      onDeviceChangeRef,
      onDeviceToggleRef,
      onDeviceEffectChangeRef,
      onDeviceParamChangeRef,
      onFootswitchRef,
      onExpPositionRef,
      onLooperFrameTapRef,
    },
    suppressFxCountRef,
    suppressFxFor,
  } = send;

  const onMidiMessage = useCallback((event: { data: unknown }) => {
    const data = getBytes(event.data);
    // Before the tap below, which consumes frames and returns: this records
    // that the device is reachable at all, and a consumed frame proves that
    // just as well as a handled one.
    sawDeviceBytesRef.current = true;
    // Looper MIDI-learn/hijack tap runs before EVERY branch below: a consumed
    // frame (learn capture, hijacked stomp, debounced sibling) must never
    // reach the normal handlers , that's what keeps a hijacked toggle from
    // being mirrored into preset state. The tap passes anything it doesn't
    // own, so real slot changes, knob turns, and effect swaps fall through
    // untouched. See src/hooks/useLooperTriggers.ts.
    const tapConsumed = onLooperFrameTapRef.current?.(data, {
      suppressed: suppressFxCountRef.current > 0,
      currentSlot: currentSlotRef.current,
    });
    if (tapConsumed) return;
    let handled = false;
    // Real-time hardware controls arrive (per current hypothesis) as standard
    // Control Change messages, NOT SysEx, so they must be routed BEFORE the
    // 0xF0 SysEx checks below, which every downstream branch requires. The exact
    // CC numbers are pending a USB capture; decodeControlChange centralizes them
    // (see src/core/midiControlMap.ts + docs/protocol-capture.md §4).
    const control = decodeControlChange(data);
    if (control) {
      if (control.kind === 'exp') onExpPositionRef.current?.(control.value);
      else onFootswitchRef.current?.(control.fsNumber, control.state);
      return;
    }
    // sub=0x08 D→H: multipurpose, preset change echo vs FX state response
    // Distinguish by data[14]: 0x08 = preset change echo, other = FX state response.
    // CAUTION: hardware footswitch presses ALSO emit data[14]=0x08 frames whose
    // slot nibbles decode to the CURRENT slot, so data[14] alone is not a
    // sufficient discriminator (no capture of the full frame yet; see
    // docs/protocol-capture.md).
    if (isSysEx(data, 0x12, 0x08) && data.length >= 28) {
      handled = true;
      if (data[14] === 0x08 && (data[21] !== 0 || data[22] !== 0)) {
        // Global-settings write echo (FS Mode [21]=01/[22]=08, Auto Cab Match
        // [21]=02/[22]=04, ...): shares data[14]=0x08 with preset changes but
        // carries a nonzero setting address at [21],[22] where preset-change
        // frames have zeros (docs/protocol-capture.md §0.2). Without this
        // guard the value byte at [26] would decode as a bogus slot change.
        console.log(
          `[GP-200] settings echo ignored (addr=${data[21]}/${data[22]} value=${data[26]})`,
        );
      } else if (data[14] === 0x08) {
        // Preset change echo: slot nibble-encoded at data[25:26]
        const slot = ((data[25] & 0x0F) << 4) | (data[26] & 0x0F);
        if (Date.now() < suppressSlotEchoUntilRef.current) {
          console.log(`[GP-200] slot-change echo suppressed during push (slot=${slot})`);
        } else if (slot >= 0 && slot < 256 && slot !== currentSlotRef.current) {
          console.log(`[GP-200] device slot change: ${slot} (${SysExCodec.slotToLabel(slot)})`);
          setCurrentSlot(slot); currentSlotRef.current = slot;
          onDeviceChangeRef.current?.(slot);
        } else if (slot === currentSlotRef.current) {
          // Same-slot "change" frame: emitted on hardware footswitch presses.
          // Acting on it would re-pull the slot's FLASH copy and clobber
          // unsaved live edits (the device's edit buffer keeps them). Ignore.
          // Cost: re-selecting the same patch on the device won't force a
          // re-pull; it re-syncs on the next real slot change or manual LOAD.
          const hex = Array.from(data.subarray(10, 28), (b) => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`[GP-200] same-slot change frame ignored (slot=${slot}, data[10..27]=${hex})`);
        }
      } else if (suppressFxCountRef.current === 0) {
        // FX state response: device reports effect toggle from hardware
        // data[22]=block_id (0=PRE..10=VOL), data[24]=state (0=OFF, non-zero=ON)
        // Suppressed during our own sends (responses are echoes, not hardware changes)
        const blockId = data[22];
        const state = data[24];
        if (blockId >= 0 && blockId <= 10) {
          console.log(`[GP-200] device FX toggle: block=${blockId} state=${state}`);
          onDeviceToggleRef.current?.(blockId, state !== 0);
        }
      }
    }
    // sub=0x0C D→H: effect change response (user changed effect type on hardware)
    // Format (38B raw): payload[12]=blockIndex, payload[26]=module(high byte),
    // payload[19:21]=variant nibble-encoded: effectId = (module<<24) | (p[19]<<4) | p[20]
    // CAUTION: those module/variant offsets belong to the longer swap frame; on
    // the 38-byte footswitch-ack variant (CTRL 4-8 report a stomp as 0x0C where
    // CTRL 1-3 use 0x08) they land in an all-zero tail, which is precisely the
    // effectId===0 case dropped below. That ack carries block@22 and state@24,
    // the same offsets the 0x08 FX-state frame uses , see isFootswitchAck0c in
    // src/core/looperTriggers.ts, which must stay in step with this check.
    if (isSysEx(data, 0x12, 0x0C) && data.length >= 38) {
      handled = true;
      const p = data.subarray(10); // payload starts after header
      const blockIndex = p[12];
      const moduleType = p[26];
      const variant = (p[19] << 4) | p[20];
      const effectId = (moduleType << 24) | variant;
      console.log(`[GP-200] device effect change: block=${blockIndex} effectId=0x${effectId.toString(16).padStart(8,'0')}`);
      // Hardware footswitch toggles also emit sub=0x0C frames with the
      // module/variant fields zeroed; decoded blindly that's "effect changed
      // to 0x00000000" (COMP) and the pedal morphs. An all-zero id IS that
      // ack shape, so drop it here (cost: a hardware switch to COMP itself
      // isn't mirrored; it re-syncs on the next slot change or pull). The
      // applied-callback further validates (known id, same module, actually
      // different); suppress the follow-up FX-state messages ONLY after a
      // real swap, so hardware toggle messages still reach onDeviceToggle.
      if (effectId !== 0) {
        const applied = onDeviceEffectChangeRef.current?.(blockIndex, effectId) ?? false;
        if (applied) suppressFxFor(500);
      }
    }
    // sub=0x10 D→H: toggle OR knob notification (46 bytes)
    // Discriminator: bytes[29:37] all zeros = knob notification, otherwise = toggle
    if (isSysEx(data, 0x12, 0x10) && data.length >= 45) {
      handled = true;
      const isKnob = data[29] === 0 && data[30] === 0 && data[31] === 0 && data[32] === 0 &&
                     data[33] === 0 && data[34] === 0 && data[35] === 0 && data[36] === 0;
      if (isKnob) {
        // Knob notification: block at [22], param at [24], nibble float32 at [37:45]
        const blockId = data[22];
        const paramIdx = data[24];
        const hi0 = data[37], lo0 = data[38], hi1 = data[39], lo1 = data[40];
        const hi2 = data[41], lo2 = data[42], hi3 = data[43], lo3 = data[44];
        const buf = new Uint8Array([(hi0 << 4) | lo0, (hi1 << 4) | lo1, (hi2 << 4) | lo2, (hi3 << 4) | lo3]);
        const value = new DataView(buf.buffer).getFloat32(0, true);
        if (blockId >= 0 && blockId <= 10) {
          onDeviceParamChangeRef.current?.(blockId, paramIdx, value);
        }
      } else {
        // Toggle notification: block at [38], state at [40]
        const blockId = data[38];
        const state = data[40];
        if (blockId >= 0 && blockId <= 10) {
          console.log(`[GP-200] device toggle: block=${blockId} state=${state}`);
          onDeviceToggleRef.current?.(blockId, state !== 0);
        }
      }
    }
    // Opt-in monitor (src/core/debugFlags.ts): hex-dump any frame no branch
    // above recognized , exactly what the pending USB-capture work needs.
    if (!handled && isMidiMonitorEnabled()) {
      console.debug(`[GP-200] rx unhandled: ${hexOfBytes(data)}`);
    }
  // suppressFxFor is intentionally omitted: it's a plain function (not
  // useCallback-memoised) that only closes over the stable suppressFxCountRef,
  // so its identity changing every render doesn't affect behavior, but
  // including it would make onMidiMessage (and everything that depends on
  // it, e.g. `connect` below) unstable every render.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onDeviceChangeRef, onDeviceToggleRef, onDeviceEffectChangeRef, onDeviceParamChangeRef,
    onFootswitchRef, onExpPositionRef, onLooperFrameTapRef, suppressFxCountRef,
    sawDeviceBytesRef,
  ]);

  /** Persist the current name list to localStorage under this device's key. */
  const persistNames = useCallback(() => {
    if (cacheKeyRef.current) saveCachedNames(cacheKeyRef.current, presetNamesRef.current);
  }, []);

  const connect = useCallback(async () => {
    // Top of the connect funnel. Instrumented here rather than in the Landing
    // button because the board deck and the phone DEVICE tab call connect too,
    // and all three (plus every retry) need to land in the same denominator.
    track('connect_start', { retry: statusRef.current === 'error' });
    setStatus('connecting');
    setErrorMessage(null);
    sawDeviceBytesRef.current = false;
    try {
      const access = await requestGP200Access();

      const outputs = Array.from(access.outputs.values());
      const inputs = Array.from(access.inputs.values());
      const output = outputs.find(isGP200Port) ?? null;
      const input = inputs.find(isGP200Port) ?? null;

      if (!output || !input) {
        // Both halves of the survey, so "sees the pedal's input but not its
        // output" reads as the half-open port it is rather than as absence.
        throw new Error(describeMissingDevice({
          portNames: [...inputs, ...outputs].map(portName),
          userAgent: currentUserAgent(),
        }));
      }

      outputRef.current = output;
      inputRef.current  = input;
      input.onmidimessage = onMidiMessage;
      setDeviceName(input.name);
      setStatus('handshaking');
      setHandshakeStep(null);

      // --- Handshake sequence ---
      try {
        // Step 1-2: Identity
        setHandshakeStep('Identity…');
        output.send(SysExCodec.buildIdentityQuery());
        const identityMsg = await waitForResponse(
          input, (d) => isSysEx(d, 0x12, 0x08), READ_TIMEOUT_MS, onMidiMessage
        );
        const identity = SysExCodec.parseIdentityResponse(identityMsg);
        // The GP-200 has no unique serial over MIDI, so key the name cache on the
        // generic deviceType byte + MIDI port name (effectively one per machine).
        cacheKeyRef.current = presetNameCacheKey(identity.deviceType, input.name);

        // Step 3-4: Enter editor mode
        setHandshakeStep('Editor Mode…');
        output.send(SysExCodec.buildEnterEditorMode());
        await new Promise(r => setTimeout(r, 100));

        // Step 5-6: State dump (0x4E: current slot at decoded[8:10] LE16)
        setHandshakeStep('State Dump…');
        output.send(SysExCodec.buildStateDumpRequest());
        const dumpChunks = await collectChunks(input, 0x12, 0x4E, 5, READ_TIMEOUT_MS, onMidiMessage);
        const stateDump = SysExCodec.parseStateDump(dumpChunks);
        const slot = stateDump.slot;
        setDeviceState(stateDump);
        setCurrentSlot(slot); currentSlotRef.current = slot;

        // Step 7-8: Version check
        setHandshakeStep('Firmware Check…');
        output.send(SysExCodec.buildVersionCheck());
        const versionMsg = await waitForResponse(
          input, (d) => isSysEx(d, 0x12, 0x0A), READ_TIMEOUT_MS, onMidiMessage
        );
        const { accepted } = SysExCodec.parseVersionResponse(versionMsg);
        setDeviceInfo({ ...identity, versionAccepted: accepted });

        // Step 9: User-IR slot enumeration (non-critical, short timeout, bail
        // on first failure). The 0x11/0x1C sweep was long believed to be a
        // controller-assignment readback; decoded 2026-08-08 as the device's
        // 30 User-IR slot names (docs/protocol-capture.md §3). The query plan
        // below mirrors the official editor's own connect sweep verbatim; the
        // flat response order is the IR slot order 0..29.
        setHandshakeStep('User IRs…');
        const ASSIGN_TIMEOUT = 300;
        const assignmentEntries: {
          section: number; page: number; block: number; name: string; rawData: Uint8Array;
        }[] = [];
        const assignmentPlan = [
          { section: 0, pages: [[0, 16], [1, 4]] },
          { section: 1, pages: [[0, 10]] },
        ];
        let assignFailed = false;
        for (const { section, pages } of assignmentPlan) {
          if (assignFailed) break;
          for (const [page, blockCount] of pages) {
            if (assignFailed) break;
            for (let block = 0; block < blockCount; block++) {
              try {
                output.send(SysExCodec.buildAssignmentQuery(section, page, block));
                const resp = await waitForResponse(
                  input, (d) => isSysEx(d, 0x12, 0x1C), ASSIGN_TIMEOUT, onMidiMessage
                );
                assignmentEntries.push(SysExCodec.parseAssignmentResponse(resp, section, page));
              } catch {
                assignFailed = true; break; // bail on first failure: device unresponsive
              }
            }
          }
        }
        setUserIrNames(assignmentEntries.map((entry) => entry.name));

        // Opt-in raw dump (src/core/debugFlags.ts): hex of each 0x12/0x1C
        // response, for eyeballing the record layout beyond the name field.
        if (isAssignmentDumpEnabled()) {
          console.log(`[GP-200] User-IR sweep: ${assignmentEntries.length} responses`);
          for (const entry of assignmentEntries) {
            const hex = [...entry.rawData]
              .map((byte) => byte.toString(16).padStart(2, '0'))
              .join(' ');
            console.log(
              `  s${entry.section} p${entry.page} b${entry.block} ` +
              `name="${entry.name}" raw=${hex}`,
            );
          }
        }

        // Step 10: Pull current bank (4 slots)
        const bankBase = Math.floor(slot / 4) * 4;
        const bankPresets: (GP200Preset | null)[] = [null, null, null, null];
        for (let i = 0; i < 4; i++) {
          const s = bankBase + i;
          const label = SysExCodec.slotToLabel(s);
          setHandshakeStep(`Slot ${label}…`);
          try {
            output.send(SysExCodec.buildReadRequest(s));
            const chunks = await collectChunks(input, 0x12, 0x18, 7, READ_TIMEOUT_MS, onMidiMessage);
            const p = SysExCodec.parseReadChunks(chunks);
            bankPresets[i] = p;
            setHandshakeStep(`Slot ${label} · ${p.patchName}`);
            if (s === slot) setCurrentPreset(p);
            presetNamesRef.current[s] = p.patchName;
          } catch {
            setHandshakeStep(`Slot ${label} · –`);
          }
          await new Promise(r => setTimeout(r, 20));
        }

        // Step 11: Seed remaining slots from the local cache so the Patch Manager
        // shows names instantly. The bank slots just pulled are device-truth and
        // are kept; only still-null slots are filled. A full cache lets us mark
        // loading complete (progress 256) so no "Loading names…" bar appears; the
        // background sync (syncPresetNames) then re-verifies every slot silently.
        const cached = cacheKeyRef.current ? loadCachedNames(cacheKeyRef.current) : null;
        if (cached) {
          for (let s = 0; s < 256; s++) {
            if (presetNamesRef.current[s] === null) presetNamesRef.current[s] = cached[s];
          }
          const filledCount = presetNamesRef.current.filter((n) => n !== null).length;
          if (filledCount === 256) setNamesLoadProgress(256);
        }
        setPresetNames([...presetNamesRef.current]);
        // Persist the freshly-pulled bank names into the cache immediately.
        persistNames();

        // Step 12: Done
        setHandshakeStep(null);
        setStatus('connected');
      } catch (err) {
        setStatus('error');
        setErrorMessage(await describeHandshakeFailure(err, sawDeviceBytesRef.current));
      }
    } catch (err) {
      setStatus('error');
      if (err instanceof Error) setErrorMessage(err.message);
      else setErrorMessage('Connection failed');
    }
  }, [onMidiMessage, persistNames]);

  const disconnect = useCallback(() => {
    namesLoadAbortRef.current = true;
    namesLoadRunningRef.current = false;
    setNamesSyncing(false);
    if (inputRef.current) inputRef.current.onmidimessage = null;
    outputRef.current = null;
    inputRef.current  = null;
    setStatus('disconnected');
    setDeviceName(null);
    setCurrentSlot(null); currentSlotRef.current = null;
    setErrorMessage(null);
    setDeviceInfo(null);
    setCurrentPreset(null);
    setUserIrNames([]);
    setDeviceState(null);
  }, []);

  /** Abort background name loading and wait for it to stop */
  const pauseNameLoading = useCallback(async () => {
    if (namesLoadRunningRef.current) {
      namesLoadAbortRef.current = true;
      // Wait for the running loop to finish (max ~600ms for one in-flight request)
      for (let i = 0; i < 20 && namesLoadRunningRef.current; i++) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
  }, []);

  const pullPreset = useCallback(async (slot: number): Promise<GP200Preset> => {
    await pauseNameLoading();
    return new Promise((resolve, reject) => {
      if (!outputRef.current || !inputRef.current) {
        reject(new Error('Not connected'));
        return;
      }
      const chunks: Uint8Array[] = [];
      let attempts = 0;
      let timer: ReturnType<typeof setTimeout>;

      function tryRequest() {
        chunks.length = 0;
        timer = setTimeout(() => {
          if (attempts < 1) {
            attempts++;
            tryRequest();
          } else {
            if (inputRef.current) inputRef.current.onmidimessage = onMidiMessage;
            setStatus('error');
            setErrorMessage('Read timeout');
            reject(new Error('Read timeout'));
          }
        }, READ_TIMEOUT_MS);

        if (inputRef.current) {
          inputRef.current.onmidimessage = (event: { data: unknown }) => {
            const data = getBytes(event.data);
            console.log('[GP-200] pull rx:', Array.from(data).map(b => b.toString(16).padStart(2,'0')).join(' '));
            onMidiMessage(event);
            if (isSysEx(data, 0x12, 0x18)) {
              chunks.push(data);
              if (chunks.length === 7) {
                clearTimeout(timer);
                if (inputRef.current) inputRef.current.onmidimessage = onMidiMessage;
                try { resolve(SysExCodec.parseReadChunks(chunks)); }
                catch (e) { reject(e); }
              }
            }
          };
        }

        const req = SysExCodec.buildReadRequest(slot);
        console.log('[GP-200] pull tx:', Array.from(req).map(b => b.toString(16).padStart(2,'0')).join(' '));
        outputRef.current!.send(req);
      }

      tryRequest();
    });
  }, [onMidiMessage, pauseNameLoading]);

  const pushPreset = useCallback(async (preset: GP200Preset, slot: number): Promise<void> => {
    await pauseNameLoading();
    if (!outputRef.current) throw new Error('Not connected');
    console.log(`[GP-200] push: slot=${slot} (${SysExCodec.slotToLabel(slot)}) name="${preset.patchName}"`);

    // Flash upload, mirroring the official editor byte-for-byte
    // (dumps/patch-upload.pcapng): encode to .prst bytes, derive the upload
    // image, send it as 0x12/0x20 chunks addressed to the target slot. The
    // device commits to flash directly , no save-commit follows (verified:
    // the uploaded patch survives a power-cycle). Because the image carries
    // the full file content, CTRL/EXP assignments travel with it.
    const fileBytes = new Uint8Array(new PRSTEncoder().encode(preset));
    const image = SysExCodec.buildUploadImage(fileBytes);
    const chunks = SysExCodec.buildUploadChunks(image, slot);
    // The device echoes lone 0xF7 acks during the burst; mute FX-state
    // handling so nothing downstream misreads upload traffic, and ignore the
    // preset-change echoes our park/return hops produce below.
    suppressFxFor(3000);
    suppressSlotEchoUntilRef.current = Date.now() + 3000;

    // The capture (dumps/patch-upload.pcapng) only ever writes to a slot the
    // device is NOT sitting on; the user re-selects it manually afterwards.
    // Writing to the active slot looked like a no-op in hardware testing:
    // the edit buffer keeps serving the pre-push patch and a preset-change
    // to the current slot doesn't reload it. So park on the adjacent
    // sub-slot first, write, then return , the return is a real slot change
    // that loads the freshly written flash copy.
    const wasActive = currentSlotRef.current === slot;
    if (wasActive) {
      const parkSlot = slot ^ 1; // same bank, adjacent sub-slot
      console.log(`[GP-200] push: parking on slot=${parkSlot} while writing active slot`);
      outputRef.current.send(SysExCodec.buildPresetChange(parkSlot));
      await new Promise(r => setTimeout(r, 300));
    }

    for (let i = 0; i < chunks.length; i++) {
      console.log(`[GP-200] push chunk ${i + 1}/${chunks.length}: ${chunks[i].length}B`);
      outputRef.current.send(chunks[i]);
      await new Promise(r => setTimeout(r, 20));
    }

    // Let the flash write settle, then switch the device to the slot so the
    // pushed patch is live (the editor leaves this to the user; we select
    // it). Hardware testing showed the device goes deaf for a while after
    // the chunk burst , a preset-change 200ms later was silently dropped —
    // so give it a generous window.
    await new Promise(r => setTimeout(r, 800));

    // Experiment toggle: the upload capture stops 30ms after the last chunk,
    // so a deferred finalize frame from the official editor would be
    // invisible in it. Hardware runs show the device answering reads but
    // discarding the upload + refusing slot changes after the burst , the
    // signature of staged data awaiting a commit. Opt in to sending the
    // known save-commit opcode as that finalize via
    // localStorage.setItem('gp200.pushCommit', '1'). CAUTION: if the device
    // treats it as a plain edit-buffer save instead, the target slot gets
    // overwritten with the currently active patch , use a scratch slot.
    let commitRequested = false;
    try {
      commitRequested = window.localStorage.getItem('gp200.pushCommit') === '1';
    } catch {
      commitRequested = false;
    }
    if (commitRequested) {
      console.log('[GP-200] push: sending save-commit finalize (experiment gp200.pushCommit)');
      outputRef.current.send(SysExCodec.buildSaveCommit(preset.patchName, slot));
      await new Promise(r => setTimeout(r, 400));
    }
    console.log(`[GP-200] push preset-change: slot=${slot}`);
    outputRef.current.send(SysExCodec.buildPresetChange(slot));

    // Update local state
    presetNamesRef.current[slot] = preset.patchName;
    setPresetNames([...presetNamesRef.current]);
    persistNames();
    setCurrentSlot(slot); currentSlotRef.current = slot;

    // Read the slot back and compare, so a discarded write is loud in the
    // console instead of silently reverting on the next pull.
    await new Promise(r => setTimeout(r, 400));
    try {
      const readback = await pullPreset(slot);
      const nameOk = readback.patchName === preset.patchName;
      const masksOf = (candidate: GP200Preset) =>
        candidate.ctrlAssignments?.map((assignment) => assignment.blockMask).join(',') ?? null;
      const wantMasks = masksOf(preset);
      const gotMasks = masksOf(readback);
      const ctrlOk = wantMasks === null || wantMasks === gotMasks;
      if (nameOk && ctrlOk) {
        console.log('[GP-200] push verify: OK (readback matches pushed name + CTRL masks)');
      } else {
        console.warn(
          `[GP-200] push verify: MISMATCH , name "${readback.patchName}" vs pushed ` +
          `"${preset.patchName}", ctrlMasks [${gotMasks}] vs pushed [${wantMasks}]. ` +
          'The device likely discarded the flash write.',
        );
      }
    } catch (err) {
      console.warn('[GP-200] push verify: readback failed', err);
    }

    console.log('[GP-200] push complete');
    // suppressFxFor is a plain per-render function, but unlike onMidiMessage
    // nothing depends on pushPreset's identity, so listing it is harmless.
  }, [pauseNameLoading, persistNames, suppressFxFor, pullPreset]);

  const saveToSlot = useCallback(async (presetName: string, slot?: number): Promise<void> => {
    if (!outputRef.current) return;
    // Save-commit persists the device's current editing buffer to flash.
    // Live edits (toggle, param, reorder) already updated the editing buffer.
    // Valeton flow (USB capture of the official editor): save-commit, then
    // ~20ms later a preset change to the slot just written.
    const targetSlot = slot ?? currentSlotRef.current ?? 0;
    // That preset change makes the pedal re-report every block's on/off state,
    // in frames the dispatcher can't tell from footswitch presses. Applied,
    // they flip blocks in the editor the moment SAVE is pressed (seen on WAH
    // and OD). Mute them for the sequence, as pushPreset does for its hops.
    suppressFxFor(2000);
    suppressSlotEchoUntilRef.current = Date.now() + 2000;
    const msg = SysExCodec.buildSaveCommit(presetName, targetSlot);
    console.log(`[GP-200] save-commit: name="${presetName}" slot=${targetSlot}`);
    outputRef.current.send(msg);
    await new Promise(r => setTimeout(r, 50));
    outputRef.current.send(SysExCodec.buildPresetChange(targetSlot));
    setCurrentSlot(targetSlot); currentSlotRef.current = targetSlot;
    // Wait for device to write to flash
    await new Promise(r => setTimeout(r, 300));
    // suppressFxFor is a plain per-render function over a stable ref (see the
    // note on onMidiMessage), so it needs no dependency entry.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Copy `fromSlot` into `toSlot` on the pedal itself, the way the official
   * Valeton editor saves a patch to another slot (USB capture, fw 1.8.0):
   * select the source so the edit buffer holds it, then save-commit naming
   * the target. No patch data crosses the wire, so nothing is lost in the
   * copy and every bank is reachable.
   */
  const copySlotOnDevice = useCallback(
    async (fromSlot: number, toSlot: number, copied: GP200Preset): Promise<GP200Preset> => {
      const fromLabel = SysExCodec.slotToLabel(fromSlot);
      const toLabel = SysExCodec.slotToLabel(toSlot);

      // Only copy what COPY actually read: if the source was edited or
      // overwritten since, the pedal would duplicate something else.
      // Both are reads of flash, so any difference at all means a change.
      const source = await pullPreset(fromSlot);
      const changed = describePatchDifferences(source, copied);
      const sourceChanges = [...changed.identity, ...changed.values];
      if (sourceChanges.length > 0) {
        console.warn(`[GP-200] device copy: ${fromLabel} changed since COPY:`, sourceChanges);
        throw new Error(
          `${fromLabel} has changed since it was copied (${sourceChanges[0]}); copy it again, then paste`,
        );
      }
      if (fromSlot === toSlot) return source;
      const output = outputRef.current;
      if (!output) throw new Error('Not connected');
      console.log(`[GP-200] device copy: ${fromLabel} -> ${toLabel} "${source.patchName}"`);

      // Selecting slots re-reports block states and slot changes; mute those
      // echoes so they can't flip blocks or pull a patch into the editor
      // mid-copy (saveToSlot mutes its own part too).
      suppressFxFor(3000);
      suppressSlotEchoUntilRef.current = Date.now() + 3000;
      // A preset change to the slot the pedal already sits on doesn't reload
      // it from flash (see pushPreset), and that edit buffer may hold unsaved
      // changes. Park on the neighbouring slot first so the buffer is exactly
      // the stored source patch.
      if (currentSlotRef.current === fromSlot) {
        output.send(SysExCodec.buildPresetChange(fromSlot ^ 1));
        await new Promise(r => setTimeout(r, 300));
      }
      output.send(SysExCodec.buildPresetChange(fromSlot));
      setCurrentSlot(fromSlot); currentSlotRef.current = fromSlot;
      await new Promise(r => setTimeout(r, 400));
      await saveToSlot(source.patchName, toSlot);

      // Read the target back and record only what the pedal reports, so the
      // list never shows a paste the pedal didn't keep.
      let readback: GP200Preset;
      try {
        readback = await pullPreset(toSlot);
      } catch {
        presetNamesRef.current[toSlot] = null;
        setPresetNames([...presetNamesRef.current]);
        persistNames();
        onDeviceChangeRef.current?.(toSlot);
        throw new Error(`Couldn't read ${toLabel} back to confirm the paste`);
      }
      presetNamesRef.current[toSlot] = readback.patchName;
      setPresetNames([...presetNamesRef.current]);
      persistNames();
      // Fail only on what a discarded or misdirected save gets wrong. Values
      // can legitimately differ: the pedal saves its live edit buffer, where
      // live controls may have moved them. Log those precisely instead.
      const result = describePatchDifferences(readback, source);
      if (result.identity.length > 0) {
        console.warn(`[GP-200] device copy: ${toLabel} does not match ${fromLabel}:`, result);
        // The pedal now sits on the target: let the editor show what it holds.
        onDeviceChangeRef.current?.(toSlot);
        throw new Error(
          `The pedal didn't take the paste: ${toLabel} differs from ${fromLabel} (${result.identity.join('; ')})`,
        );
      }
      if (result.values.length > 0) {
        console.info(
          `[GP-200] device copy: ${toLabel} matches ${fromLabel} except values the pedal saved from its live buffer:`,
          result.values,
        );
      }
      console.log(`[GP-200] device copy verified: ${toLabel} = "${readback.patchName}"`);
      return readback;
    },
    // suppressFxFor: see saveToSlot. onDeviceChangeRef is a stable ref.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [pullPreset, saveToSlot, persistNames],
  );

  const writePresetToSlot = useCallback(async (preset: GP200Preset, slot: number): Promise<void> => {
    await pauseNameLoading();
    if (!outputRef.current) throw new Error('Not connected');
    const output = outputRef.current;
    const label = SysExCodec.slotToLabel(slot);
    console.log(`[GP-200] writeToSlot: slot=${slot} (${label}) name="${preset.patchName}"`);

    // Step 1: Switch device to the target slot (loads current data into editing buffer)
    output.send(SysExCodec.buildPresetChange(slot));
    await new Promise(r => setTimeout(r, 200));

    // Step 2: Send all effects via live editing for each slot.
    // Per block: set the effect TYPE first (buildEffectChange, sub=0x14), then
    // params, then on/off state. Without the effect change the device keeps the
    // algorithm it already had loaded and the params/toggle apply to the wrong
    // effect, so the saved slot ends up as "whatever was already there" (#80).
    // IMPORTANT: address each block by its fixed slotIndex (0=PRE..10=VOL), NOT
    // the array position. PRSTDecoder returns effects in playback order, so for
    // a reordered preset the array position diverges from slotIndex and array
    // addressing writes every effect to the wrong physical block (#90).
    for (let i = 0; i < preset.effects.length; i++) {
      const eff = preset.effects[i];
      output.send(SysExCodec.buildEffectChange(eff.slotIndex, eff.effectId));
      await new Promise(r => setTimeout(r, 30));
      for (let p = 0; p < eff.params.length; p++) {
        if (eff.params[p] !== undefined) {
          output.send(SysExCodec.buildParamChange(eff.slotIndex, p, eff.effectId, eff.params[p]));
          await new Promise(r => setTimeout(r, 8));
        }
      }
      output.send(SysExCodec.buildToggleEffect(eff.slotIndex, eff.enabled));
      await new Promise(r => setTimeout(r, 15));
    }

    // Step 3: mirror the signal-chain order so the saved slot keeps the preset's
    // routing (the block writes above are slot-addressed and order-independent),
    // then send author + save-commit to persist (#90).
    await new Promise(r => setTimeout(r, 50));
    output.send(SysExCodec.buildReorderEffects(
      preset.effects.map(e => e.slotIndex), preset.fxLoopSend, preset.fxLoopReturn,
    ));
    await new Promise(r => setTimeout(r, 30));
    // Per-patch master VOL/PAN/TEMPO, so the saved slot doesn't inherit the
    // editing buffer's previous values. PAN is device-encoded (left = 256 + signed).
    output.send(SysExCodec.buildPatchSetting(0x00, preset.patchVolume));
    await new Promise(r => setTimeout(r, 30));
    output.send(SysExCodec.buildPatchSetting(0x06, preset.patchPan & 0xFF));
    await new Promise(r => setTimeout(r, 30));
    output.send(SysExCodec.buildPatchSetting(0x01, preset.patchTempo));
    await new Promise(r => setTimeout(r, 30));
    if (preset.author) {
      output.send(SysExCodec.buildAuthorName(preset.author));
      await new Promise(r => setTimeout(r, 30));
    }
    output.send(SysExCodec.buildSaveCommit(preset.patchName, slot));
    // Wait for device to finish writing to flash before returning
    await new Promise(r => setTimeout(r, 300));
    console.log(`[GP-200] writeToSlot complete: ${label} → "${preset.patchName}"`);

    // Update local state
    presetNamesRef.current[slot] = preset.patchName;
    setPresetNames([...presetNamesRef.current]);
    persistNames();
    setCurrentSlot(slot); currentSlotRef.current = slot;
  }, [pauseNameLoading, persistNames]);

  /** Read one slot's name the way the official Valeton editor does
   *  (USB capture of it connecting, fw 1.8.0): a full read request, then the
   *  WHOLE 7-chunk reply before anything else is sent. The official editor
   *  never uses the name-only request (sub=0x20) and never starts the next
   *  read while a reply is still arriving. This code used to do both, taking
   *  the name from the first chunk and firing the next request at once, and
   *  on hardware nearly every name timed out ("-" in the Patch Manager).
   *
   *  The reply is identified rather than assumed: it starts at chunk offset 0
   *  (anything earlier is the tail of a previous reply) and the patch names
   *  its own slot at decoded[6:8]. */
  const requestSlotName = useCallback(
    (slot: number, timeoutMs: number): Promise<string | null> => {
      return new Promise<string | null>((resolve) => {
        let chunks: Uint8Array[] = [];
        const finish = (name: string | null) => {
          clearTimeout(timer);
          // Hand the input back only if it is still ours, so a late timeout
          // can't hijack a read that has started since.
          if (inputRef.current && inputRef.current.onmidimessage === handler) {
            inputRef.current.onmidimessage = onMidiMessage;
          }
          resolve(name);
        };
        const handler = (event: { data: unknown }) => {
          const data = getBytes(event.data);
          onMidiMessage(event);
          if (!isSysEx(data, 0x12, 0x18)) return;
          const offset = data[11] | (data[12] << 8);
          if (offset === 0) chunks = [];
          else if (chunks.length === 0) return;
          chunks.push(new Uint8Array(data));
          if (chunks.length < 7) return;
          const decoded = SysExCodec.assembleChunks(chunks);
          if ((decoded[6] | (decoded[7] << 8)) !== slot) {
            chunks = [];
            return;
          }
          finish(SysExCodec.parsePresetName(chunks[0]));
        };
        const timer = setTimeout(() => finish(null), timeoutMs);
        if (inputRef.current) inputRef.current.onmidimessage = handler;
        outputRef.current!.send(SysExCodec.buildReadRequest(slot));
      });
    },
    [onMidiMessage],
  );

  const loadPresetNames = useCallback(async (): Promise<void> => {
    if (!outputRef.current || !inputRef.current) return;
    if (namesLoadRunningRef.current) return; // already running
    namesLoadRunningRef.current = true;
    namesLoadAbortRef.current = false;
    // The official editor's cadence: whole reply, ~20ms pause, next slot.
    // It read all 257 slots that way in about 6 seconds.
    const READ_TIMEOUT = 500; // a full reply lands within a few ms
    const READ_GAP_MS = 20;
    const BATCH_SIZE = 8;     // Update UI every 8 slots instead of every slot

    for (let s = 0; s < 256; s++) {
      if (namesLoadAbortRef.current) break;
      if (presetNamesRef.current[s] !== null) {
        setNamesLoadProgress(s + 1);
        continue;
      }
      const name = await requestSlotName(s, READ_TIMEOUT);
      if (namesLoadAbortRef.current) break;
      presetNamesRef.current[s] = name;
      // Batch UI updates: only re-render every BATCH_SIZE slots or on the last slot
      if ((s + 1) % BATCH_SIZE === 0 || s === 255) {
        setPresetNames([...presetNamesRef.current]);
      }
      setNamesLoadProgress(s + 1);
      await new Promise(r => setTimeout(r, READ_GAP_MS));
    }
    // Final flush in case we stopped mid-batch
    setPresetNames([...presetNamesRef.current]);
    if (inputRef.current) inputRef.current.onmidimessage = onMidiMessage;
    namesLoadRunningRef.current = false;
    // Warm the cache with whatever this pass filled in.
    persistNames();
  }, [onMidiMessage, requestSlotName, persistNames]);

  // Force-read every slot and correct any that drifted from the cache-seeded
  // values. Runs silently in the background after a cache hit; the Patch
  // Manager already shows cached names, so this only patches in differences.
  // Shares the run/abort refs with loadPresetNames (both hijack
  // input.onmidimessage, so they must never run concurrently) and is aborted by
  // pauseNameLoading / disconnect.
  const syncPresetNames = useCallback(async (): Promise<void> => {
    if (!outputRef.current || !inputRef.current) return;
    if (namesLoadRunningRef.current) return; // a scan is already running
    namesLoadRunningRef.current = true;
    namesLoadAbortRef.current = false;
    setNamesSyncing(true);
    // Same cadence as loadPresetNames (the official editor's).
    const READ_TIMEOUT = 500;
    const READ_GAP_MS = 20;
    let changed = false;

    for (let s = 0; s < 256; s++) {
      if (namesLoadAbortRef.current) break;
      const name = await requestSlotName(s, READ_TIMEOUT);
      await new Promise(r => setTimeout(r, READ_GAP_MS));
      if (namesLoadAbortRef.current) break;
      // A null read is a transient miss (timeout), so keep the cached value rather
      // than blanking a slot we already have a good name for.
      if (name !== null && name !== presetNamesRef.current[s]) {
        presetNamesRef.current[s] = name;
        changed = true;
        setPresetNames([...presetNamesRef.current]);
      }
    }
    if (inputRef.current) inputRef.current.onmidimessage = onMidiMessage;
    namesLoadRunningRef.current = false;
    setNamesSyncing(false);
    if (changed) persistNames();
  }, [onMidiMessage, requestSlotName, persistNames]);

  const refreshNames = useCallback(async (): Promise<void> => {
    await pauseNameLoading();
    // Keep the names the handshake already pulled (current bank); those came
    // from full reads moments ago; clear everything else for re-enumeration.
    const bankBase = (() => {
      if (currentSlotRef.current === null) return -1;
      return Math.floor(currentSlotRef.current / 4) * 4;
    })();
    for (let s = 0; s < 256; s++) {
      const inCurrentBank = bankBase >= 0 && s >= bankBase && s < bankBase + 4;
      if (!inCurrentBank) presetNamesRef.current[s] = null;
    }
    setPresetNames([...presetNamesRef.current]);
    setNamesLoadProgress(0);
    await loadPresetNames();
  }, [pauseNameLoading, loadPresetNames]);

  const renameSlot = useCallback(async (slot: number, name: string): Promise<void> => {
    await pauseNameLoading();
    if (!outputRef.current) throw new Error('Not connected');
    const output = outputRef.current;
    const previousSlot = currentSlotRef.current;
    // Preset-change loads the slot into the device's editing buffer; the
    // save-commit then persists that buffer under the new name. Effect data
    // is untouched because nothing else was edited in between.
    output.send(SysExCodec.buildPresetChange(slot));
    await new Promise(r => setTimeout(r, 200));
    // Gap C experiment (docs §2b): the device ignores the name inside
    // save-commit, so renames don't persist. Behind the debug flag, try the
    // hypothesized single-field name write first; the save-commit then
    // persists the edit buffer it (hopefully) just changed.
    if (isNameWriteEnabled()) {
      output.send(SysExCodec.buildPatchName(name));
      await new Promise(r => setTimeout(r, 150));
    }
    output.send(SysExCodec.buildSaveCommit(name, slot));
    await new Promise(r => setTimeout(r, 300));
    presetNamesRef.current[slot] = name;
    setPresetNames([...presetNamesRef.current]);
    persistNames();
    setCurrentSlot(slot); currentSlotRef.current = slot;
    if (previousSlot !== null && previousSlot !== slot) {
      output.send(SysExCodec.buildPresetChange(previousSlot));
      await new Promise(r => setTimeout(r, 200));
      setCurrentSlot(previousSlot); currentSlotRef.current = previousSlot;
    }
  }, [pauseNameLoading, persistNames]);

  // Bulk apply: write the same CTRL assignments and/or patch volume into many
  // saved patches. Per slot this replays the proven renameSlot sequence —
  // preset-change loads the slot into the edit buffer, live writes mutate it,
  // save-commit persists it , so it inherits that path's hardware guarantees
  // (and its caveats: CTRL mask bit 7/MOD does not apply live, docs §3).
  const bulkApplyAbortRef = useRef(false);
  const [bulkApplyProgress, setBulkApplyProgress] = useState<BulkApplyProgress | null>(null);

  const cancelBulkApply = useCallback(() => {
    bulkApplyAbortRef.current = true;
  }, []);

  const bulkApply = useCallback(async (
    slots: number[],
    options: BulkApplyOptions,
  ): Promise<{ done: number; cancelled: boolean }> => {
    await pauseNameLoading();
    if (!outputRef.current) throw new Error('Not connected');
    const output = outputRef.current;
    const previousSlot = currentSlotRef.current;
    bulkApplyAbortRef.current = false;
    let done = 0;

    try {
      for (const slot of slots) {
        if (bulkApplyAbortRef.current) break;
        setBulkApplyProgress({ done, total: slots.length, slot });
        // Long enough to cover every frame this iteration sends, so the FX
        // dispatcher can't mistake device echoes for hardware-initiated edits.
        suppressFxFor(1200);
        output.send(SysExCodec.buildPresetChange(slot));
        await new Promise(r => setTimeout(r, 200));

        if (options.volume !== undefined) {
          output.send(SysExCodec.buildPatchSetting(0x00, options.volume));
          await new Promise(r => setTimeout(r, 30));
        }
        if (options.ctrlAssignments) {
          for (const assignment of options.ctrlAssignments) {
            output.send(SysExCodec.buildCtrlAssignment(
              assignment.ctrlIndex,
              assignment.blockMask,
              assignment.state,
            ));
            await new Promise(r => setTimeout(r, 30));
          }
        }

        // The device ignores the name field in save-commit (docs §2b), so a
        // cached name is cosmetic; the buffer's own name is what persists.
        output.send(SysExCodec.buildSaveCommit(presetNamesRef.current[slot] ?? '', slot));
        await new Promise(r => setTimeout(r, 300));
        done++;
        setBulkApplyProgress({ done, total: slots.length, slot });
      }
    } finally {
      setBulkApplyProgress(null);
      if (previousSlot !== null) {
        output.send(SysExCodec.buildPresetChange(previousSlot));
        await new Promise(r => setTimeout(r, 200));
        setCurrentSlot(previousSlot); currentSlotRef.current = previousSlot;
      }
    }
    return { done, cancelled: bulkApplyAbortRef.current };
  }, [pauseNameLoading, suppressFxFor]);

  // All send* helpers + device-callback setters come from useMidiSend (see
  // the top of the hook where `send` is instantiated). The return value at
  // the bottom spreads them onto the public API.

  // Track connection state for auto-reconnect
  useEffect(() => {
    if (status === 'connected') {
      wasConnectedRef.current = true;
      reconnectAttemptsRef.current = 0;
    }
  }, [status]);

  // Auto-reconnect when connection drops (USB replug, page navigation)
  useEffect(() => {
    if (status === 'disconnected' && wasConnectedRef.current && reconnectAttemptsRef.current < 3) {
      reconnectTimerRef.current = setTimeout(() => {
        reconnectAttemptsRef.current++;
        console.log(`[GP-200] auto-reconnect attempt ${reconnectAttemptsRef.current}/3`);
        connect();
      }, 2000);
    }
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [status, connect]);

  return {
    status, handshakeStep, errorMessage, deviceName, currentSlot, presetNames, namesLoadProgress,
    namesSyncing,
    deviceInfo, currentPreset, userIrNames, deviceState,
    connect, disconnect, loadPresetNames, syncPresetNames, refreshNames,
    pullPreset, pushPreset, copySlotOnDevice, writePresetToSlot, saveToSlot, renameSlot,
    bulkApply, bulkApplyProgress, cancelBulkApply,
    // Send operations + device-callback registration are owned by useMidiSend.
    sendEffectChange: send.sendEffectChange,
    sendToggle: send.sendToggle,
    sendParamChange: send.sendParamChange,
    sendReorder: send.sendReorder,
    sendFxLoopMove: send.sendFxLoopMove,
    sendSlotChange: send.sendSlotChange,
    sendAuthor: send.sendAuthor,
    sendStyleName: send.sendStyleName,
    sendNote: send.sendNote,
    sendPatchVolume: send.sendPatchVolume,
    sendPatchPan: send.sendPatchPan,
    sendPatchTempo: send.sendPatchTempo,
    sendExpParamSelect: send.sendExpParamSelect,
    sendExpMinMax: send.sendExpMinMax,
    sendCtrlAssignment: send.sendCtrlAssignment,
    sendFsMode: send.sendFsMode,
    sendFsTarget: send.sendFsTarget,
    sendFsCombo: send.sendFsCombo,
    sendAutoCabMatch: send.sendAutoCabMatch,
    sendCC: send.sendCC,
    ccChannel: send.ccChannel,
    setCcChannel: send.setCcChannel,
    sendRawChunks: send.sendRawChunks,
    setOnDeviceChange: send.setOnDeviceChange,
    setOnDeviceToggle: send.setOnDeviceToggle,
    setOnDeviceEffectChange: send.setOnDeviceEffectChange,
    setOnDeviceParamChange: send.setOnDeviceParamChange,
    setOnFootswitch: send.setOnFootswitch,
    setOnExpPosition: send.setOnExpPosition,
    setOnLooperFrameTap: send.setOnLooperFrameTap,
  };
}
