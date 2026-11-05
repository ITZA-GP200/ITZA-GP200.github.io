# Changelog: GP200 Studio PM

Versions are **X.Y.Z**: X = a major feature release, Y = a functional release
within a version, Z = an iterative release (typos, labels and similar).

## 1.3.2: released 5 November 2026 as `pm.1.3.2`

More of the bar board, found by using it.

**One bar per row**, on every block but the graphic EQ, which keeps two
across because six full-width bars make a card half again as tall as anything
beside it. 1.3.1 split them by bay width, which meant a module counted as
knob-heavy because one of its effects is — so GREEN OD, TWEEDY, DETUNE, PURE
and ROOM were split too, for three bars each. It goes by the effect's own
control count now.

**A control label is a control label.** The names on bars were inheriting the
card's body face at 15px while the names under dials were JetBrains Mono 800
at 13px, so the same parameter looked like a different kind of thing
depending on which control it was wearing. They are now identical in face,
size, weight, tracking and colour, and both move together under Label Size.

**The control deck stays on the floor.** It was `position: sticky`, which
only reaches the bottom when the content is tall enough to push it there — so
it rode up the screen whenever the board got shorter, which switching to bars
does. The board takes the slack instead.

**Switching styles no longer depends on having reloaded.** Changing a control
style used to give a different board from opening the app already in that
style — smaller, not filling the screen. The board is at the largest scale
that fits, by the same rule however it got there.

A consequence worth stating: bar cards are the more compact of the two
controls, so an all-bars board sits at a larger scale than an all-dials one
and everything on it reads bigger. They can only be the same size if bars
reserve the room dials would need, and that reservation has to re-derive what
the browser works out from flex and font metrics — which the Label Size
slider already perturbs. Filling the screen was the better trade.

## 1.3.1: released 4 November 2026 as `pm.1.3.1`

Switching one pedal between dials and bars rearranged the whole board. Three
separate faults, all introduced in 1.3.0 and all now fixed.

**Pedals no longer change row.** The chain is split into fixed rows, decided
from its length and nothing else. Where a line broke used to be a layout
outcome, which is right for enclosures that are all one size and wrong for
cards: a card's height follows its control count, so switching the EQ to bars
made the board taller, the fit scaled it down, more cards then fitted a line
and the chain re-wrapped — the EQ jumped from the second row to the first for
no reason the user caused. Rows changing height to make room for bars is
expected; pedals changing row while you work is not.

**Nothing else shrinks when one pedal changes.** The board is scaled by a
single zoom to keep all of it on screen, so one card growing taller shrank
every other pedal's controls with it. A bar card was about 90px taller than
the same block drawn as dials, and 1.3.0 had spent the headroom that used to
hide it — levelling the rows cost ~18px, and splitting the chain into real
rows repeated a 24px padding that had only ever applied once, at the top.

Bars now cost LESS height than the dials they replace: tighter leading and
track spacing, and in the wide bays — the knob-heavy modules, where six
stacked bars did the damage — they sit two across. The board cannot grow when
a pedal switches to bars, so the fit has nothing to react to and nothing
moves.

**The levelling gives way rather than overflow.** Where the two rows still
cannot both be raised to the tallest without pushing the board past the
screen, the board keeps its rows at their own heights instead of scrolling,
and takes the levelling back as soon as there is room.

## 1.3.0: released 4 November 2026 as `pm.1.3.0`

Three refinements to the card board, all of them about reading it from where
you actually stand: at a mic, looking down.

**Control labels read in CAPS.** The param names only. Readings keep the case
their unit is written in, because "500MS" reads as a typo — and so do the EQ
bands, whose *names* are readings: "1.6kHz" stays as written while VOLUME
beside it shouts. The case is drawn by CSS, so the text a screen reader
announces is unchanged.

**Label Size**, under Label Brightness in any card's colour popover. The two
are the same question asked twice — can you read this from there — so they
live together, and both cover the whole board rather than one pedal. 80% to
130%, and it rides along in the exported settings file.

The ceiling is measured, not picked. A label's column grows with the type, so
a name is exactly as likely to fit at 130% as at 100%; past about 136% two
columns stop fitting a card, every card drops to one control per row and the
board stops fitting the screen. The slider cannot reach that.

**Every row is the same height** — when the screen can afford it. A card's
height used to follow its control count, so a six-knob AMP sat taller than a
one-knob GATE and the two rows of the chain never lined up. They are measured
now and levelled to the tallest, with the slack going to each card's control
area. It holds however the chain wraps, and it re-measures rather than
ratchets, so a shorter effect shrinks the board back down.

Levelling raises every row to the tallest, and what that costs depends on how
the chain happens to divide. With dials the rows are within a few pixels of
each other and it is free. Switch the board to bars and one row holds the
six-bar EQ while the other holds the short blocks, so the short row grows by
about 110px — on a shallow window, enough to push the whole board past the
point where it still fits. Seeing the whole board beats seeing it levelled,
so the board gives the levelling up rather than start scrolling, and takes it
back as soon as there is room.

## 1.2.0: released 29 October 2026 as `pm.1.2.0`

The pedalboard stops pretending to be made of wood and metal. Every block is
a card now, on both the board and the phone, and the things that were only
ever a label — the FX loop's two ends — became things you can pick up.

**The board and the phone wear one skin.** A card has a flat dark field, a
key colour on its border and its name, a value arc or a bar for every knob,
and a rectangular ACTIVE switch instead of a footswitch. Three controls live
in its header: key colour (sixteen of them), dial or bar, and a lock that
freezes the look and the values but deliberately not the position or the
on/off — a locked block is still part of a chain you reorder and still
something you stomp on. The phone card carries the same three and opens its
controls in place rather than pushing a second screen.

**One grey, one slider.** Labels, module chips, chain numbers, value names,
info chips and tool icons were drawn in four different greys that were all
trying to be the same thing. They are one colour now, and **Label
Brightness** in any card's colour popover moves it across the whole board.
Hairlines and surfaces stay out of it: a 1px divider at label brightness
reads as a drawn box rather than an edge.

**The FX loop is a thing you move.** Solid triangles in the palette's own
colours, up for the signal leaving and down for it coming back. On the board
they sit above each line of cards and drag onto any block. On the phone they
are half-width markers with a grip and an EDIT, and drag along the chain. In
the loop panel the labels and the markers finally have a band each — eleven
names and eleven drop targets never fitted one row, which is why the old
arrows were so hard to hit. The target went from 11px to 30px.

**PATCHES, LOOP, DRUMS and DEVICE wear the skin too.** Rack ears and their
screws are gone, headings take the cards' weight, the beige buttons are dark
with an accent wash, and the DEVICE screen's three patch knobs wear the
board's value arc.

**SAVE SETTINGS / LOAD SETTINGS.** Everything the editor remembers about you
rather than about a patch lives in this browser, because the GP-200 patch
format has no field for it — which is exactly what keeps an exported `.prst`
byte-identical to what the Valeton software reads. The cost was that a phone
and a desktop kept separate settings and clearing site data wiped them with
no warning. Two buttons beside SAVE LOG are the way out. Import merges rather
than replaces, refuses anything outside the editor's own storage, and refuses
a profile from a newer build whole rather than half-applying it.

**The front door wears it too.** The start screen is rebuilt in the same
language: a strip of the eleven blocks across the top in their key colours
with the board's flow triangles between them, the fork's own bolt in place of
upstream's GP-200 unit, cards instead of a panel, and CONNECT sitting in a lit
card so the thing to do carries an ACTIVE block's glow. The strip is always
one row — initials stand in below 700px, where eleven three-letter blocks and
ten arrows stop fitting, because a strip that wraps stops reading as a signal
chain. kabir0st's pages move to the footer as GP200 Studio | Original by
Kabir Tamari | Read the guide, in the same grey as everything else.

**Gone:** the phone's old tap-through editor screen. The card opens its
controls in place, so nothing routed to it any more.

## 1.1.1: released 25 October 2026 as `pm.1.1.1`

The release the project starts from. `pm.1.1.0` went out the day before and
was live for a few hours; this closes it with the front door rebuilt, and the
tag was left where it was rather than moved, so the history says what actually
happened.

- The start screen is the fork's front door now: **ITZA GP-200 STUDIO**, four
  bullets saying what this fork adds rather than what the original does, and a
  **Why ITZA GP-200** panel explaining what it is and what it needs. The panel
  is a `<details>`, because the page is prerendered and has to read with
  JavaScript off. "What is GP200 Studio?" and "Read the guide" point at
  kabir0st's own site — he should get the visit, and his pages are the ones he
  keeps current. The version reads as the fork's own: accent, not grey.
- kabir0st's support link is gone from the whole fork — the editor chrome, the
  landing hero, the phone shell, the credits block and three documents. A
  donation ask belongs on his site, not on a fork of his work. Every credit to
  him stays, and the byline now reads "Originally built by Kabir Tamari".

## 1.1.0: released 24 October 2026 as `pm.1.1.0`

The fork's first numbered release under its own name and version scheme. It
moved to its own home at the same time: the site is served from
https://itza-gp200.github.io and the repository is
ITZA-GP200/ITZA-GP200.github.io.

Rebased onto kabir0st's latest stable (his `PRODUCTION` of 25 September 2026),
which brings his value entry on knobs, tempo sync, the new start screen and his
landing-page change, with his tests. Our features and fixes are unchanged.

- Each saved log is named for the second it was written
  (`gp200-studio-log-2026-10-24-07-37-43Z.txt`), so saving twice never
  produces "… (1).txt" and the files sort into order.
- **SAVE LOG** in the Patch Manager writes what the editor has been doing to a
  text file: the last 600 of its own lines, plus every warning and error,
  timed from when the page was opened, under a header naming the app version,
  the pedal's firmware, the browser and the knobs this pedal refuses. It is
  written only when the button is pressed and sent nowhere by itself. Support
  used to mean talking someone through opening DevTools.
- The "shift/ctrl-click to select more" line sits above the row of actions
  rather than inside it, so the actions stay together on one row.
- A finished job says so in green, in plain words, and a slow one promises the
  next will be quicker: "RESTORE 64 done. The next one will be much faster.
  This pedal won't let the app set 3 knobs; set them by hand if you want them:
  64A PITCH Hi Pitch 0 (should be 12); …". It used to arrive in the red of a
  failure, counting "value(s) the pedal kept its own way", which is the
  pedal's problem described in the pedal's terms. The speed line only appears
  when the run actually took a while, so it never promises what it can't keep.
- The busy band's progress bar is shorter, and beside it reads "be patient and
  don't touch your pedal" — the part that matters while you wait.
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
