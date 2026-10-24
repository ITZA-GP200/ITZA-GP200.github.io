/**
 * Knobs this pedal refuses to be told about.
 *
 * Some parameters can't be set over MIDI: the pedal takes the message, then
 * stores its own value anyway (COMP's Clipping is the known one on firmware
 * 1.8.0). A patch file can easily hold such a value — an older backup, or a
 * patch exported from somewhere else — and then every write of it looks like
 * it failed: the slot never matches, so it is written again on the next run,
 * and a restore that should take seconds takes a minute.
 *
 * So the refusals are remembered, keyed by effect and parameter (see
 * knobDifferenceList), in this browser's localStorage. Once a control has
 * been refused twice in a row, the editor stops arguing with the pedal about
 * it: writes aren't retried for it, and a slot that differs only by one is
 * treated as already correct. Everything else is checked exactly as before.
 */

const STORAGE_KEY = 'gp200:stubbornValues';

export function loadStubbornValues(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    return new Set();
  }
}

/** Add what a write just proved, and keep it for next time. */
export function rememberStubbornValues(keys: Iterable<string>): Set<string> {
  const known = loadStubbornValues();
  let added = false;
  for (const key of keys) {
    if (!known.has(key)) {
      known.add(key);
      added = true;
    }
  }
  if (added) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...known]));
    } catch {
      // Storage unavailable: the editor just re-learns them next time.
    }
  }
  return known;
}

/** For a fresh start, or a different pedal. */
export function forgetStubbornValues(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
