# Changelog: GP200 Studio PM

Versions are **X.Y.Z**: X = a major feature release, Y = a functional release
within a version, Z = an iterative release (typos, labels and similar).

## 1.1.0: 23 October 2026 (in progress, not yet released)

Rebased onto kabir0st's latest stable (his `PRODUCTION` of 25 September 2026),
which brings his value entry on knobs, tempo sync, the new start screen and his
landing-page change, with his tests. Our features and fixes are unchanged.

- **RETEST KNOBS** in the Patch Manager, next to RELOAD ALL. It appears only
  once this pedal has refused something, and clears what the editor has
  learned so those knobs are tested from scratch — for a different pedal, or
  to check a refusal still stands. Nothing on the pedal changes.
- The report of what the pedal kept its own way now names the knob and rounds
  the value: "64A PITCH HI PITCH 0 vs 12", not "64A PRE param 0 0 vs
  84.19125366210938". It is the list of what to set by hand, so it should read
  like one.
- When a write misses a knob, only that knob is sent again. Writing a patch
  from app data takes 10-20 seconds, and the check afterwards used to repeat
  the whole write to tell a swallowed message from a value the pedal refuses —
  so discovering one refusal cost two full writes. The second attempt now
  sends just the controls that differ, in a second or two. A first-time
  restore of a backup holding a refused value drops from about 49 seconds to
  under 20; after that it is the 3 seconds below.
- The editor remembers which controls this pedal refuses to be told about.
  Some cannot be set over MIDI (COMP's Clipping on firmware 1.8.0): the pedal
  takes the message and keeps its own value. A backup holding one used to make
  every slot look wrong for ever, so a restore rewrote all of it every time,
  retrying each write to be sure — 49 seconds, every run. Those refusals are
  now remembered, and a slot that differs only by one counts as correct. On
  hardware the same restore went from 49 seconds to about 3 on the second run.
  A wrong name, effect or on/off state is never excused this way.
- PROTECT 64 and RESTORE 64 now read each slot first: a slot that already
  holds the right patch is left alone, and a slot whose settings match one
  already in place is filled by an on-pedal copy (about two seconds) rather
  than written setting by setting (10-20 s). A typical restore drops from
  about a minute to under twenty seconds; putting back a drifted swap slot
  takes a couple of seconds.
- The Patch Manager shows a band across the top while the pedal is busy: what
  is running, how far through, a progress bar and cancel. The patch list dims
  and ignores clicks until it finishes.
- Slot actions wait for a name scan to finish. A scan owns the pedal's MIDI
  connection, and starting a write during one could save the wrong patch.
- REFRESH is now RELOAD ALL, and re-opens the patch the pedal is on as well as
  re-reading every name.
- Fixed: a patch read now has to be the slot that was asked for. The reader
  accepted any reply, so a read fired straight after another could be served
  the previous one's tail — on hardware, UNDO refused to undo its own swap
  because the slot it checked came back with its neighbour's patch. (The bug
  is upstream’s, and predates our fork.)
- UNDO and REDO now say what changed when they refuse, not just which slot.
- Dropped the contact form: GitHub Pages serves static files only, so its PHP
  can't run there. Feature requests and bug reports go to the repository's
  GitHub issues. (It is still in v1.0.0, tag `fork2-done-2026-09-19`, if the
  editor ever moves to a host with PHP.)
- Retired two documents that were history rather than documentation: the
  fork-1 lessons and the copy of the note sent upstream. Both remain in the
  v1.0.0 history.

## 1.0.1 (folded into 1.1.0)

- PATCHES: the patch the pedal is on is labelled **ACTIVE** (was NOW), both its tag in the list
  and the header ("active: 63C", was "now: 63C").

## 1.0.0: 19 September 2026 (tag `fork2-done-2026-09-19`)

First release: copy / paste / cut / swap, reset, undo / redo, protected bank 64
with SAVE / RESTORE 64, SAVE PATCH / SAVE ALL, imports, contact form, user
guide and support docs. See [README.md](README.md).
