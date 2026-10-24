/**
 * The PM HELP panel: what the Patch Manager's buttons do, in the order
 * someone actually needs them, shown in place of the patch list.
 *
 * Deliberately one screen of summary rather than the manual. The full guide
 * is a separate page (/guide/managing-patches) with screenshots; this is what
 * you read without leaving the panel, so it stays short enough to scan while
 * the pedal is busy.
 */

const GUIDE_PATH = `${import.meta.env.BASE_URL}guide/managing-patches`;

interface Entry {
  name: string;
  text: string;
}

const FILE_ROW: Entry[] = [
  { name: 'IMPORT .PRST', text: 'Loads a patch file into the editor so you can hear it first. Nothing reaches the pedal until you save.' },
  { name: 'EXPORT .PRST', text: 'Saves the patch you are editing to a file on your computer.' },
  { name: 'PRINT', text: 'A rig sheet: this patch, its footswitches, and the slot list.' },
];

const SLOT_ROW: Entry[] = [
  { name: 'ACTIVATE', text: 'Switches the pedal to the selected slot, as if you pressed it on the unit.' },
  { name: 'OPEN', text: 'Loads the selected slot into the editor, without changing the pedal.' },
  { name: 'EXPORT', text: 'Downloads the selected slot as a .prst file.' },
  { name: 'IMPORT→', text: 'Writes a .prst file straight into the selected slot, overwriting it.' },
  { name: 'RENAME', text: 'Renames the selected slot on the pedal.' },
];

const MULTI_ROW: Entry[] = [
  { name: 'COPY / PASTE', text: 'Shift-click or ctrl-click to take several patches at once. Pasting checks every slot afterwards and stops at the first that did not take.' },
  { name: 'SWAP', text: 'Select exactly two and they exchange places, using the swap slot as scratch space.' },
  { name: 'RELOAD ALL', text: 'Forgets the cached names, reads all 256 from the pedal again, and re-opens the patch the pedal is on. Writes nothing.' },
];

function Row({ entry }: { entry: Entry }) {
  return (
    <div className="flex gap-3 py-1.5">
      <span
        className="font-mono-display text-caption font-bold flex-shrink-0"
        style={{ color: 'var(--accent)', minWidth: '7.5rem' }}
      >
        {entry.name}
      </span>
      <span className="font-mono-display text-caption" style={{ color: 'var(--text-secondary)' }}>
        {entry.text}
      </span>
    </div>
  );
}

function Section({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <section className="mb-4">
      <h3
        className="font-mono-display text-caption font-bold uppercase tracking-wider mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h3>
      {entries.map((entry) => <Row key={entry.name} entry={entry} />)}
    </section>
  );
}

export function PatchManagerHelp() {
  return (
    <div
      className="h-full overflow-y-auto px-4 py-3"
      // Its own scroll, like the list it replaces, so the panel's own chrome
      // stays put while this scrolls.
      role="region"
      aria-label="Patch Manager help"
    >
      <p className="font-mono-display text-caption mb-4" style={{ color: 'var(--text-secondary)' }}>
        The Patch Manager reads and writes the pedal directly. Everything here acts on the
        pedal itself, not on a file — except the FILE row, which is the only part that works
        with the pedal unplugged.
      </p>

      <Section title="File" entries={FILE_ROW} />
      <Section title="The selected slot" entries={SLOT_ROW} />
      <Section title="Several at once" entries={MULTI_ROW} />

      <section className="mb-4">
        <h3
          className="font-mono-display text-caption font-bold uppercase tracking-wider mb-1"
          style={{ color: 'var(--text-muted)' }}
        >
          Bank 64
        </h3>
        <p className="font-mono-display text-caption" style={{ color: 'var(--text-secondary)' }}>
          PROTECT 64 sets bank 64 aside for the app: 64C holds the patch RESET copies, 64D is
          scratch space for swaps, and nothing shifts into the bank by accident. SAVE 64 writes
          a backup file; RESTORE 64 puts one back. A restore takes about half a minute the
          first time and a few seconds after that, because the first run learns which knobs
          this pedal refuses.
        </p>
      </section>

      <section className="mb-4">
        <h3
          className="font-mono-display text-caption font-bold uppercase tracking-wider mb-1"
          style={{ color: 'var(--text-muted)' }}
        >
          When something looks wrong
        </h3>
        <p className="font-mono-display text-caption mb-2" style={{ color: 'var(--text-secondary)' }}>
          Some knobs cannot be set over MIDI at all — the pedal takes the message and keeps its
          own value. A finished job lists any it met, and those are yours to set by hand. The
          editor remembers them so it stops rewriting a slot over one; RETEST KNOBS makes it
          test them again from scratch.
        </p>
        <p className="font-mono-display text-caption" style={{ color: 'var(--text-secondary)' }}>
          SAVE LOG writes what the editor has been doing to a text file — slots, timings and
          patch names — to send on if something needs looking at. It is not sent anywhere by
          itself.
        </p>
      </section>

      <p className="font-mono-display text-caption" style={{ color: 'var(--text-muted)' }}>
        The full guide, with screenshots:{' '}
        <a
          href={GUIDE_PATH}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'underline' }}
        >
          managing patches
        </a>
      </p>
    </div>
  );
}
