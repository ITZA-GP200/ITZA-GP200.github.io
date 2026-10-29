/**
 * This browser's settings, as a file.
 *
 * Everything the editor remembers about *you* rather than about a patch —
 * board colours, control styles, locks, label brightness, the knobs your pedal
 * refuses, your default patch, your protected bank — lives in localStorage,
 * because the GP-200 patch format has no field for any of it. That is what
 * keeps an exported .prst byte-identical to what the Valeton software expects:
 * none of this is ever written into a patch.
 *
 * The cost of that is real: localStorage is per-origin and per-browser, so a
 * phone and a desktop keep separate settings, and clearing site data wipes
 * them with no warning. This module is the way out — one file to carry them
 * between machines, and a backup for the day the browser forgets.
 *
 * It exports the whole `gp200:` namespace rather than a hand-listed set. A
 * list would quietly go stale: the next feature to remember something would
 * add a key here and not there, and nobody would notice until a restore came
 * back missing it.
 */

/** Settings live under this prefix; nothing else in storage is ours. */
export const PROFILE_PREFIX = 'gp200:';

/** Bumped only if the shape below changes incompatibly. */
export const PROFILE_VERSION = 1;

export interface Profile {
  kind: 'itza-gp200-profile';
  version: number;
  /** ISO 8601, for the human reading the file, not for the importer. */
  exportedAt: string;
  /** Which build wrote it, so an old file's oddities can be explained. */
  app: string | null;
  settings: Record<string, string>;
}

/** Every `gp200:` key this browser holds, in a stable order. */
export function readSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PROFILE_PREFIX)) keys.push(key);
    }
    // Sorted so two exports of the same settings are the same file, which is
    // what makes them diffable and worth keeping in version control.
    for (const key of keys.sort()) {
      const value = localStorage.getItem(key);
      if (value !== null) out[key] = value;
    }
  } catch {
    // Storage unavailable (private window, blocked site data): an empty
    // profile is honest, and the caller reports the count.
  }
  return out;
}

export function buildProfile(app: string | null = null): Profile {
  return {
    kind: 'itza-gp200-profile',
    version: PROFILE_VERSION,
    exportedAt: new Date().toISOString(),
    app,
    settings: readSettings(),
  };
}

/** Pretty-printed: this is a file people open and read. */
export function serializeProfile(profile: Profile): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

/** `itza-gp200-settings-2026-10-28-2312.json` — sortable, no collisions. */
export function profileFilename(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
    + `-${p(now.getHours())}${p(now.getMinutes())}`;
  return `itza-gp200-settings-${stamp}.json`;
}

export interface ImportResult {
  ok: boolean;
  /** Keys written. */
  applied: string[];
  /** Keys in the file this build will not write, and why. */
  skipped: { key: string; reason: string }[];
  /** Set when the file could not be read at all. */
  error?: string;
}

/**
 * Apply a profile file to this browser.
 *
 * Deliberately additive: keys in the file are written, keys only in this
 * browser are left alone. Someone importing a colour scheme should not
 * silently lose the bank backup they took this morning, and "merge" is the
 * only behaviour that cannot destroy something the file never knew about.
 * Anything outside the `gp200:` namespace is refused — a profile is not a
 * licence to write arbitrary storage.
 */
export function importProfile(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, applied: [], skipped: [], error: 'That file is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, applied: [], skipped: [], error: 'That file is not a settings profile.' };
  }
  const profile = parsed as Partial<Profile>;
  if (profile.kind !== 'itza-gp200-profile') {
    return { ok: false, applied: [], skipped: [], error: 'That file is not an ITZA GP-200 settings profile.' };
  }
  if (typeof profile.version !== 'number' || profile.version > PROFILE_VERSION) {
    return {
      ok: false,
      applied: [],
      skipped: [],
      error: `That profile was written by a newer version of the editor (v${String(profile.version)}).`,
    };
  }
  const settings = profile.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { ok: false, applied: [], skipped: [], error: 'That profile has no settings in it.' };
  }

  const applied: string[] = [];
  const skipped: ImportResult['skipped'] = [];
  for (const [key, value] of Object.entries(settings as Record<string, unknown>)) {
    if (!key.startsWith(PROFILE_PREFIX)) {
      skipped.push({ key, reason: 'not an editor setting' });
      continue;
    }
    if (typeof value !== 'string') {
      skipped.push({ key, reason: 'not text' });
      continue;
    }
    try {
      localStorage.setItem(key, value);
      applied.push(key);
    } catch {
      skipped.push({ key, reason: 'storage is full or unavailable' });
    }
  }
  return { ok: applied.length > 0 || skipped.length === 0, applied, skipped };
}
