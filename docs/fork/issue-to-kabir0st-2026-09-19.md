Hi kabir0st,

First, thank you for GP200 Studio, and for making it open source. It's a brilliant piece of work, and it made my GP-200 far easier to live with; but I also found some things that weren't working quite as I expected or hoped they would. Thus, this fork.

I've spent the last couple of weeks building on your latest GH version, mostly to expand upon patch management in the PATCHES slide-out, but with a few touches to other parts of the application as well. The fork is here: https://github.com/klynam/gp200-studio-PM (branch fork2/final; "PM" for patch manager).

**Bugs I hit on my pedal (GP-200, firmware 1.8.0)**

These affect the live site too, so you may want them regardless of the rest. I confirmed each one against a USB capture of Valeton's official editor.

- Saves are silently ignored. The save-commit's u16 after the slot number has to be 0x005a; the app sends 0x0000, and the pedal ignores the save without any error. With 0x5a (and a preset change to the slot ~20–50 ms later, as the official editor does), saves persist.
- Patch names mostly fail to load ("-" in the list). The official editor sends full reads (11/10), waits for the whole 7-chunk reply, then pauses ~20 ms before the next. The name-only request (11/20) and overlapping reads time out on my pedal. The name cache hides this on the live site until it's cleared.
- The chunked flash upload (12/20) is ignored by the pedal, so paste and IMPORT→slot don't stick. It also masks the slot with & 0x7F, so slots from bank 33 up would wrap (63C → 31C). Copying on the pedal itself (select the source, then save-commit under the target's number and name) works for every slot, and is what the official editor does.
- Writing a whole patch live also needed each effect's switches (e.g. Sync) sent before its knobs, and every block's first defined control re-sent last (a cab's first knob is slot 1), or those values were lost.

**What the fork adds**

- Copy / paste (ranges, scattered slots, cancel), cut, and swap (right-click, PASTE ▸ SWAP, ▲UP / ▼DOWN) through a user-chosen swap slot
- Reset to a chosen default patch, undo / redo (Ctrl+Z / Ctrl+Y, last 20 actions, refused if a slot changed since)
- An optional protected bank 64 (default patch, swap slot, two utility slots) with backup and restore
- Every change is read back from the pedal to confirm it landed
- There's a user guide and a technical write-up (protocol findings, design rules) in docs/fork/.

**Would any of it be useful to you?**
I'd be glad to send pull requests, split into small, focused ones, starting with the bug fixes above. Entirely your call, of course, including if none of it fits where you want to take the project.

If you're not interested in folding my work into gp200studio.com/editor, no problem at all, but in that case I'd like to put the fork up on a site of my own, clearly credited as a fork of GP200 Studio with a link back here. Just let me know how you'd prefer to roll forward.

Thanks again for building the GP200 Studio editor, and for making it available for further work on GitHub.

klynam
