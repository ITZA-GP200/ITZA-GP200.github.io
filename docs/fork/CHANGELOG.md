# Changelog: GP200 Studio PM

Versions are **X.Y.Z**: X = a major feature release, Y = a functional release
within a version, Z = an iterative release (typos, labels and similar).

## 1.1.0: 23 October 2026 (in progress, not yet released)

Rebased onto kabir0st's latest stable (his `PRODUCTION` of 25 September 2026),
which brings his value entry on knobs, tempo sync, the new start screen and his
landing-page change, with his tests. Our features and fixes are unchanged.

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
