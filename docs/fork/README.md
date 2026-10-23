# GP200 Studio PM: patch-management fork

https://github.com/klynam/gp200-studio-PM ("PM" = patch manager)

A fork of [GP200 Studio](https://github.com/kabir0st/gp200-studio) by
**kabir0st**, focused on managing the Valeton GP-200's 256 patches from the
editor's **PATCHES** slide-out, and on the save and name-read fixes the pedal
needs on firmware 1.8.0. Free and open source under GPL-3.0, like the
original. Built and hardware-tested on one GP-200 (firmware 1.8.0), Windows 11
and Chrome.

Version 1.1.0 (23 October 2026): our v1.0.0 work on top of kabir0st's latest
stable (his `PRODUCTION`, 25 September 2026). See [CHANGELOG.md](CHANGELOG.md);
versions are X.Y.Z (major feature / functional / iterative).

## What this fork adds

- **Copy / paste** one patch, a range, or scattered slots (cancel mid-way);
  **cut and paste**; **swap** (right-click with two selected, PASTE ▸ SWAP, the
  SWAP button, ▲UP / ▼DOWN) through a user-chosen swap slot.
- **Reset** a slot to a chosen default patch; **rename**.
- **Undo / redo** (menu, Ctrl+Z / Ctrl+Y): the last 20 actions of the session,
  refused if a slot changed since.
- **Protected bank 64**: 64A UTILITY-1, 64B UTILITY-2, 64C ITZA GP-200 (the
  default patch), 64D SWAP SLOT, with fixed names, overrun protection (63D is the
  last slot for multi-slot actions), USE FOR DEFAULT PATCH (64C), SAVE 64 /
  RESTORE 64 (browser copy + JSON file) and a warning if bank 64 changes on the
  pedal.
- **SAVE PATCH** (quick commit, like SAVE on the pedal), **SAVE ALL** (writes
  every setting from the editor's copy, checked), **REFRESH**, imports that ask
  before saving, a working spinner and a reload (⚡) button.
- Every change is read back from the pedal to confirm it landed.

## Documents

| File | For |
|---|---|
| [patch-management-guide.html](patch-management-guide.html) | Users: the training guide (open it in a browser) |
| [5174-Editor-support.md](5174-Editor-support.md) | Users: upload to ChatGPT or Claude to get a support assistant for this editor |
| [AI-PROJECT-CONTEXT.md](AI-PROJECT-CONTEXT.md) | Developers and AI coding assistants: how the fork works and why |
| [CHANGELOG.md](CHANGELOG.md) | Everyone: what changed in each version |

## Running it

```bash
npm install
npx vite --port 5174 --strictPort --open /editor
```

Chrome (or Edge) is required for Web MIDI. Connect one editor to the pedal at a
time.

## Known limits

Writes from the editor's own copy of a patch (SAVE ALL, IMPORT, PROTECT 64,
RESTORE 64, undoing an overwrite) can't set expression-pedal assignments or a
footswitch's saved on/off position, and COMP's Clipping stays at its default.
On-pedal copies (paste, swap, cut, reset) carry everything. See the guide,
section 6.

## Thanks

To **kabir0st** for GP200 Studio and for making it open source
([buy him a coffee](https://buymeacoffee.com/kabir0st)). GP-200 and Valeton are
their trademarks; this project is not affiliated with or endorsed by them.
