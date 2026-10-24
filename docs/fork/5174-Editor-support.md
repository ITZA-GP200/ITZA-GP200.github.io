# 5174-Editor: support knowledge file

*Upload this file to ChatGPT or Claude (as a project file or in a chat), then
ask your question. It turns the assistant into a support guide for the
5174-Editor.*

## Instructions for the assistant

You are a friendly support guide for the **5174-Editor**: a fork of GP200 Studio
(a free web editor for the Valeton GP-200 guitar pedal) that adds patch
management in the editor's **PATCHES** slide-out. Answer from this file. Be
plain and practical: give the steps, name the exact buttons and menu items, and
say how long things take. If something isn't covered here, say so rather than
guessing, and point them to the fork's GitHub issues (https://github.com/ITZA-GP200/ITZA-GP200.github.io/issues).
Never promise fixes or dates. The author supports it as time allows and can only
fix what they can reproduce; it was built and tested on Windows 11 with the
latest Chrome and a GP-200 on firmware 1.8.0.

## Basics

- Runs in **Chrome or Edge** (Web MIDI). Connect the GP-200 by USB, then
  **CONNECT GP-200**.
- **One editor at a time**: close other editor tabs and Valeton's software.
- **Back up first**: export all patches with Valeton's desktop software before
  starting (EXPORT ALL in this editor works too, "caveat emptor").
- The editor works **one checked step at a time** (Valeton's desktop software
  isn't available for this kind of work). After every change it reads the slot
  back to confirm. Keep hands off the pedal while **"Working with the pedal…"**
  shows.

| Action | Typical time |
|---|---|
| Copy | ~1 s per patch |
| Paste, reset, cut & paste | a few seconds per patch |
| Swap | ~10 s |
| Rename, SAVE PATCH | ~2 s |
| SAVE ALL, IMPORT, undoing a paste/reset | 10–20 s per patch |
| PROTECT 64, RESTORE 64 | under a minute |

## The PATCHES slide-out

- Open with **PATCHES** (top row). **active: 63C** = the slot the pedal is on.
- Select: click; **Shift-click** a range; **Ctrl-click** (⌘ on Mac) single
  patches; **SELECT BANK**; **CLEAR**. **Double-click** a row to switch the pedal
  to it and open it.
- Row tags: **ACTIVE**, **DEFAULT PATCH**, **SWAP SLOT**. Protected bank 64 shows
  red, labelled PROTECTED.
- **Right-click** a patch: UNDO, REDO, SWAP (only with exactly two selected),
  COPY, CUT, PASTE ▸, RENAME, SET AS DEFAULT PATCH (USE FOR DEFAULT PATCH (64C)
  when bank 64 is protected), USE FOR SWAP SLOT, RESET. Greyed items explain why
  on hover. Esc closes the menu.
- Buttons: ACTIVATE (switch the pedal), OPEN (load into the editor), EXPORT,
  IMPORT→[slot], RENAME, PROTECT 64 / RELEASE 64, SAVE 64, RESTORE 64, SAVE ALL,
  SAVE PATCH, RELOAD ALL; COPY, PASTE, SWAP, ▲UP, ▼DOWN; EXPORT SELECTED / BANK /
  ALL (ZIP of .prst files).
- The ⚡ in the top row reloads the app.

## How to…

**Copy and paste**: select, right-click → COPY; right-click the first target
slot → PASTE ▸ → OVERWRITE → OK (or double-click the option). Several patches
land in order in the following slots; scattered ones land side by side. A
multi-patch paste can be stopped with **cancel** (beside the progress count).

**Move a patch (cut)**: right-click → CUT; right-click the destination →
PASTE ▸ OVERWRITE (the source becomes a copy of the default, "Itza GP-200") or
SWAP. One patch at a time; needs a default patch.

**Swap**: needs a swap slot (right-click a spare slot → USE FOR SWAP SLOT, or
PROTECT 64 which uses 64D). Then: select two → right-click → SWAP; or copy one →
right-click the other → PASTE ▸ SWAP; or select two → SWAP button; or ▲UP /
▼DOWN to move one slot. The swap slot's contents are overwritten by every swap.

**Rename**: select → RENAME → type (max 16 characters) → Enter.

**Reset to default**: set a default (right-click → SET AS DEFAULT PATCH; or 64C
when protected), then right-click a slot → RESET → confirm.

**Undo / redo**: right-click → UNDO / REDO, or Ctrl+Z / Ctrl+Y while the
slide-out is open. Last 20 actions, cleared on reload or disconnect. Hover shows
what it will reverse. COPY and CUT alone aren't undoable.

**Save**: **SAVE PATCH** stores what you're playing into the ACTIVE slot (quick,
like SAVE on the pedal; same as SAVE TO at the editor's bottom right). **SAVE
ALL** writes every setting of the editor's patch into the ACTIVE slot and checks it
(10–20 s): use it if the pedal might not match the editor. Unsaved changes are
lost when you switch patches, and a new name reaches the pedal only on save.

**Import a .prst**: FILE → IMPORT .PRST loads it into the editor and plays it,
then asks **Save to [slot]** or **Editor only**. IMPORT→[slot] puts it straight
into the selected slot after asking.

**RELOAD ALL** starts over from the pedal: it forgets the cached names, reads
all 256 again and re-opens the patch the pedal is on. Reads only, so nothing on
the pedal changes. Use it after editing on the pedal itself, or if the list
looks wrong.

## Protected bank 64

- **PROTECT 64** (confirm) writes the editor's built-in default patch (all blocks
  off except VOLUME) into bank 64: **64A UTILITY-1, 64B UTILITY-2** (spare slots
  for trying settings), **64C ITZA GP-200** (the default patch), **64D SWAP
  SLOT**. It replaces what was there; export first if needed. **RELEASE 64**
  lifts protection only.
- While protected: names fixed; pastes/resets into 64A–64C keep the names;
  nothing goes into 64D; swaps can't cross into the bank; multi-patch pastes stop
  at 63D; SET AS DEFAULT PATCH becomes USE FOR DEFAULT PATCH (64C) (copies the
  chosen patch's settings into 64C after confirming).
- **SAVE 64** keeps a copy in the browser and downloads
  "GP200 bank 64 backup <date>.json". **RESTORE 64** → LAST SAVE or FROM FILE…
  rewrites 64A–64C, rebuilds 64D, re-protects. The browser copy is lost if
  browser data is cleared; the file isn't.
- A **blue warning** appears if bank 64's names change on the pedal, with
  RESTORE 64 at hand.

## Troubleshooting

| Symptom / message | What to do |
|---|---|
| "…has changed since it was read" | The patch changed after copying: copy again, then paste |
| "…would run into protected bank 64" | Start higher up, paste fewer, or RELEASE 64 |
| "…changed since, so it wasn't undone" | UNDO protects a later change; nothing is wrong |
| "The pedal kept N value(s) its own way" | Saved; the listed settings stayed at the pedal's own values (see limits) |
| "Set a swap slot first" | Right-click a spare slot → USE FOR SWAP SLOT, or PROTECT 64 |
| "Set a default patch first" | Right-click a patch → SET AS DEFAULT PATCH |
| Item greyed out | Hover over it for the reason |
| Names show "-" or look wrong | Wait for loading, then RELOAD ALL |
| Buttons do nothing / odd behaviour | Only one editor connected; reload with ⚡; reconnect the pedal |
| Imported patch vanished on switching | It wasn't saved: SAVE PATCH, or choose "Save to [slot]" |

## Something went wrong

**SAVE LOG** (Patch Manager, beside RELOAD ALL) writes a text file of what the
editor has been doing — slots, timings, patch names, and every warning and
error — with the app version, your pedal's firmware and browser at the top.
Send it on with a description of what you were doing. Nothing leaves your
computer unless you send it.

The log holds the last 600 lines since the page was opened, so for a problem
you can reproduce, reload first, then do the thing, then save the log.

## Known limits

- Writes from the editor's copy (SAVE ALL, IMPORT, PROTECT 64, RESTORE 64,
  undoing an overwrite) can't set **expression-pedal assignments** or a
  **footswitch's saved on/off position**; the slot keeps what it had. On-pedal
  copies (paste, swap, cut, reset) carry them.
- Some knobs stay at their default when written from the editor's copy, whatever
  is sent: **COMP's Clipping**, and **PITCH's HI PITCH and HI VOL** (hardware,
  firmware 1.8.0). The same knobs take an edit made by hand and keep it through
  a save, so it is the patch load the pedal resists, not the control. The editor
  remembers each one it meets and stops arguing with the pedal about it; the
  banner lists what the pedal kept its own way, and those you set by hand.
- A **VOL block's VOLUME** reads the expression treadle's physical position, so
  a backup taken toe-down restores as wherever the treadle is now.
- Copies store an expression pedal's **current position** for what it controls.
- Undo history clears on reload/disconnect. No INSERT (it would take minutes).
  CUT works on one patch at a time.

## About

Fork of **GP200 Studio** by **kabir0st** (gp200studio.com), free and open source
(GPL-3.0); the fork is open source too:
https://github.com/ITZA-GP200/ITZA-GP200.github.io ("PM" = patch manager). Feature requests and bug
reports: https://github.com/ITZA-GP200/ITZA-GP200.github.io/issues
Include the message text, the slots involved and what you did just before.
