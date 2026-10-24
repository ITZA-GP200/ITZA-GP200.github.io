# AI project context: GP200 Studio PM (patch-management fork)

Repository: https://github.com/klynam/gp200-studio-PM (branch `fork2/final`; upstream: kabir0st/gp200-studio `PRODUCTION`).

Read this before changing the fork. It records what the code can't tell you:
what the hardware actually does, which approaches failed, and the rules the
design depends on. Everything marked *verified* was confirmed on a real GP-200
(firmware 1.8.0) by the project owner.

## How the project is run

- **One hardware-tested change at a time.** Build, run the checks, commit on
  its own branch, then the owner tests on the pedal in their own Chrome at
  `http://localhost:5174/editor` (`npx vite --port 5174 --strictPort --open /editor`).
  Unit tests prove logic; only the pedal proves protocol.
- Before each commit: `npx tsc -b`, `npx oxlint src tests`, `npx vitest run`
  (all must pass; ~1,160 tests at v1.0). Don't let a command chain commit past
  a failing test.
- Branches were stacked `fork2/*` (name-scan → … → undo-keys → final). Tags mark
  owner-verified points (see History).
- After hook or prop changes, the running page needs a hard reload (⚡ or
  Ctrl+Shift+R).
- **Versioning is X.Y.Z** (owner's scheme): X = major feature release, Y =
  functional release within a version, Z = iterative release (typos, labels).
  Keep `package.json` and `docs/fork/CHANGELOG.md` in step; tag releases `vX.Y.Z`.
  Work stays local until the owner releases it.

## Stack

React 19, Vite 8, TypeScript (`erasableSyntaxOnly`), Tailwind, vitest +
testing-library, oxlint. Web MIDI (Chrome/Edge). Upstream base: `PRODUCTION`
487f282 of kabir0st/gp200-studio. Check out with `core.autocrlf=false`,
`core.eol=lf` (a CRLF checkout changes the build output).

## Map of the fork's code

| File | What it holds |
|---|---|
| `src/hooks/useMidiDevice.ts` | Device I/O: name reads, `pullPreset`, `saveToSlot`, `copySlotOnDevice`, `writePresetToSlot`, `renameSlot`, echo suppression |
| `src/core/devicePush.ts` | `pushPresetToDevice`: live push of a whole patch (+ the finishing pass) |
| `src/core/SysExCodec.ts` | Message builders (`buildSaveCommit` sets the 0x5a field) |
| `src/core/samePatch.ts` | `describePatchDifferences` (identity vs values), `SourceChangedError` |
| `src/core/writeFidelity.ts` | Compares a write's read-back, only for params the effect defines |
| `src/core/multiPaste.ts` | `pasteProblem`, `pasteMany`, `describeRange` |
| `src/core/swapThrough.ts` | Swap via a scratch (swap) slot |
| `src/core/protectBank.ts` | PROTECT 64 layout, fixed names, `writeChecked` (write + check + one retry) |
| `src/core/bank64Backup.ts` | SAVE 64 / RESTORE 64, change warning |
| `src/core/shippedPatch.ts` | The built-in default patch (base64 .prst, owner's 48A export) |
| `src/core/undoHistory.ts` | UNDO / REDO engine |
| `src/core/defaultPatch.ts`, `swapSlot.ts` | Remembered default patch and swap slot (localStorage) |
| `src/components/PatchManagerSheet.tsx` | The PATCHES slide-out: rules for what's enabled, buttons, confirms |
| `src/components/PatchContextMenu.tsx` | Right-click menu |
| `src/components/PatchPicker.tsx` | The list: tags, protected-bank styling |
| `src/App.tsx` | Handlers wiring it together, undo recording wrappers |

## GP-200 protocol facts (verified)

- Header `F0 21 25 7E 47 50 2D 32`; byte 8 = CMD (0x11 request, 0x12 set/notify),
  byte 9 = sub.
- **Save** = 12/18 save-commit, one TLV `{0x2003, len 20, u16 absolute slot,
  u16 0x005a, char[16] name}`. The 0x005a field is required (zero is silently
  ignored). Slots are absolute 0–255. Follow with a preset change to the slot.
  The pedal saves its **live edit buffer**.
- **Preset change** 12/08 (slot as nibbles at bytes 25–26).
- **Reading names/patches**: full 11/10 reads, wait for the whole 7-chunk reply,
  ~20 ms gap before the next. Never name-only (11/20) requests.
- **Identify every read reply, never assume it.** A reply starts at chunk
  offset 0 (wire bytes 11-12) and names its own slot at decoded[6:8]. Both
  `requestSlotName` and `pullPreset` check this and drop a reply for another
  slot. Upstream's `pullPreset` took any 7 chunks, so reads close together
  (a copy's verification, then UNDO's bookkeeping) could be served each
  other’s replies — the symptom was UNDO refusing to undo its own swap.
- **The chunked flash upload (12/20) is ignored by the pedal.** Never write
  patches that way.
- **On-pedal copy** (what the official editor does): select the source
  (park on a neighbour first if it's the current slot), save-commit under the
  target number and name, read back. Carries everything, including EXP/CTRL.
  Live controls (an expression pedal on VOL/WAH) are saved at their current
  position, so compare copies by *identity*, not exact values.
- **Echoes**: selecting slots re-reports block states; mute them or blocks flip
  in the editor (`suppressFxFor`, `suppressSlotEchoUntilRef`).
- **Writing a patch from app data** (live push, then save) works only with:
  40 ms between param messages; each block's first control re-sent after the
  others; a settle after effect changes; a second pass; and a **finishing pass**
  per block over the effect's *defined* params, **switches/selectors before
  knobs** (a Sync switch sent after Rate/Feedback resets them), first control
  first and last (a cab's first real knob is slot 1). Now inside
  `pushPresetToDevice`, so live previews are faithful too.
- **Can't be written live**: EXP assignments (no live unassign either) and a
  CTRL footswitch's saved on/off position. Re-sending CTRL/EXP at the end of a
  push corrupted unrelated knobs; don't. COMP's Clipping stays at its default
  10 once COMP is freshly loaded, and so do PITCH's HI PITCH (0) and HI VOL
  (50) — verified 24 Oct 2026 by setting both by hand, saving and re-reading:
  a hand edit sticks, a patch load doesn't, and the block saves fine (DRY in
  the same save kept its new value). Expect more of this family; see
  `stubbornValues.ts`, which learns them per browser rather than listing them.
  A VOL block's VOLUME is the treadle's physical position, never settable.
- Only params the effect defines (`effectParams.ts`, generated from Valeton's
  algorithm.xml) matter; other slots of the 15 hold leftovers.
- Windows' MIDI service lets several programs open the pedal: run one editor.

## Design rules

1. **Verify by read-back.** Every write reads the slot back. Identity
   differences (name, effect types, on/off) fail; value-only differences are
   retried once, then reported as "kept N value(s) its own way", not failed.
2. **Re-read sources.** A paste/cut/reset re-reads its source and refuses
   (`SourceChangedError`) if it no longer matches what was copied.
3. **Protected bank 64**: fixed names (`PROTECTED_LAYOUT`), 63D is the last
   slot for sequential actions, nothing into 64D, swaps can't cross into it,
   default = 64C and swap slot = 64D are locked, SET AS DEFAULT becomes USE FOR
   DEFAULT PATCH (64C). Anything written into the default's slot re-reads the
   default snapshot (else RESET refuses later).
4. **Undo** records only slots that really changed (read before and after each
   action), keeps 20 entries, session only, and refuses if a slot changed since.
5. **Say where the patches are** in every partial-failure message.
6. Greyed-out items always carry a tooltip saying why.

## Gotchas

- Paths contain spaces (`C:\Users\My PC`): quote shell variables.
- Bash heredocs mangle some quoting; write edit scripts to files.
- The upstream name cache can hide read failures on the live site.
- Menu state must reset during render when its position changes (an effect ran
  after layout and left it invisible).
- A live preview checks for abort only between blocks: `stopLivePreview` /
  `waitForLivePreview` in App.

## History (tags)

| Tag | Milestone |
|---|---|
| `fork2-verified-2026-09-17` | Name scan, saves, paste, rename sync, menu, RESET |
| `fork2-verified-2026-09-18` | Swap, swap slot, polish |
| `write-verified-2026-09-18` | Writing a patch from app data |
| `fork2-verified-bank64-2026-09-18` | Multi-paste, PROTECT/SAVE/RESTORE 64 |
| `fork2-round-complete-2026-09-19` | CUT, UNDO/REDO, SAVE/REFRESH, ⚡ |
| `fork2-done-2026-09-19` | v1.0: imports fixed, SAVE PATCH / SAVE ALL, right-click SWAP, Ctrl+Z/Y, contact form, docs |

## Open ideas

- A USB capture of Valeton's desktop editor assigning EXP / CTRL, and moving a
  patch (a native move message could make INSERT practical).
- The contact form (v1.0.0, tag `fork2-done-2026-09-19`) was dropped in 1.1.0:
  GitHub Pages is static and can't run its PHP. Restore it from that tag if the
  editor ever moves to a host with PHP.
