# GP-200 Patch Manager: lessons from fork 1

Written 2026-09-17, when development on the first fork was stopped and a
fresh, unmodified copy of the original was set up to start over.

## Where things are

| | Location | Status |
|---|---|---|
| **Fork 1** (stopped) | `~/my-gp200-studio`, branch `feature/patch-context-menu` | Kept for reference only. Not reused. |
| **Fresh copy** | `~/gp200-studio-clean`, upstream commit `487f282` | Unmodified. Served at http://localhost:5174/editor |
| **Live original** | https://gp200studio.com/editor | Known good |
| **USB captures** | `~/my-gp200-studio/dumps/official-write/`, `official-toggles/` (data, not code) | Ground truth for the protocol |

## The fresh copy is provably identical to the live site

- The live site shows no version number, build date or commit.
- But Vite names bundle files by a hash of their content. A build of upstream
  commit `487f282` (GitHub's newest, 2026-08-23) produces **exactly** the live
  site's files: `main-C6iI3otS.js`, `main-CTIiW7Vd.css`,
  `analytics-DCxNUcCJ.js`, `analytics-DqASUl85.css`, `MobileShell-D8AilOky.js`,
  `looper-recorder.worklet-DR5gA2tC.js`.
- **Windows gotcha:** Git's default checkout converts line endings to CRLF,
  which changes the main bundle by 78 bytes. Check out with
  `core.autocrlf=false` to reproduce the live build.
- The live bundle was unchanged between 2026-09-11 and 2026-09-17.

So fork 1 started from the right code. Every loading problem was introduced
inside fork 1.

## Protocol facts, verified on this pedal (fw 1.8.0)

1. **The chunked "flash upload" (`12/20`) does not work.** The official
   Valeton editor never sends it. Don't write patches that way.
2. **Save = a `12/18` save-commit** whose payload is one TLV:
   `{type 0x2003, len 20, u16 slot, u16 0x005a, char[16] name}`.
   - The `0x005a` field is required. Upstream sends it as zero, and the pedal
     silently ignores that save.
   - The slot is the absolute index (0-255), so banks 33-64 work.
   - The official editor sends a preset change to the saved slot ~20 ms later.
   - That preset change makes the pedal re-report every block's on/off state.
     Mute those echoes, or the editor display flips blocks (seen on WAH and OD).
3. **Copying a patch needs no data transfer:** select the source slot (preset
   change), then save-commit naming the target. The pedal copies its own buffer.
4. **Preset change (`12/08`)** encodes the slot as two nibbles at bytes 25-26,
   which covers all 256 slots (40A = `09 0c`).
5. **Block toggle (`12/10`):** byte 38 = block (0 PRE, 1 WAH, 2 OD/DST … 8 DLY,
   9 RVB, 10 VOL). Bytes 41-44 vary between captures and are ignored.
6. **Read replies (`12/18`)** are 7 chunks (6 × 185 + 1 × 66 decoded bytes).
   - Byte 10 is always `0x09`. It is **not** the slot.
   - Offset is at bytes 11-12. The slot is at decoded bytes 6-7.
   - Replies are not tagged with the request they answer, so a late reply to
     a timed-out read can arrive during the next read.
7. **Upstream's fast name-only read works on this pedal.** The live site
   loads all names correctly, about twice as fast as fork 1.

## What went wrong in fork 1 (don't repeat)

- **Its starting code (before our sessions) replaced upstream's working name
  reader**, on the untested claim that it was "unreliable on hardware". The
  replacement accepted any 7 chunks as a reply, so late chunks mixed two
  patches together: `?` names, "Failed to load preset from device", slow loads.
- **Confident code comments were treated as facts.** Several turned out to be
  wrong once checked against a USB capture or the live site.
- **Many changes were stacked before hardware testing**, so failures were hard
  to attribute.
- **Names were recorded before the pedal confirmed a write**, so the list
  showed patches the pedal never stored.

## How to work on the fresh copy

1. **Verify first:** use 5174 and gp200studio.com side by side on the same
   pedal. They should behave identically.
2. **Keep upstream's reading and loading code untouched** unless a capture
   proves it wrong.
3. **One small change at a time, with a hardware test after each commit.**
   Compare against the live site whenever something looks off.
4. **Base every write on the official editor's captured bytes**, and read the
   slot back before showing the result.
5. **Suggested order:**
   - the right-click menu, calling upstream's existing single-slot actions;
   - then the save-commit `0x5a` fix, tested alone;
   - then device-side copy for paste;
   - then the multi-slot operations.

## Open questions to settle on the fresh copy

- **Banks 31-34:** in fork 1, some patches there failed while their neighbours
  loaded fine. Check the same banks on 5174. If the clean copy reads them, the
  cause was fork 1. If not, look for what those patches have in common (their
  name, patch data, or slot number).
- **Swap fidelity:** a swap needs one data write, and the live push can't carry
  EXP assignments, style, notes or FX-loop mode. The official editor's
  patch-move feature (a message upstream decompiled but never verified on
  hardware) is worth capturing before building swap.
