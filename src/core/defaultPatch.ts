import { GP200PresetSchema, type GP200Preset } from './types';

/**
 * The user's default patch: the template RESET copies into a slot.
 *
 * RESET is an on-pedal copy from the slot the user picked ("SET AS DEFAULT
 * PATCH"), saved under DEFAULT_PATCH_NAME. The patch as read at that moment
 * is kept too, so RESET can refuse if that slot has changed since, the same
 * safety paste has. Stored in this browser's localStorage; storage failures
 * (private mode, quota) degrade to "no default set".
 */

export const DEFAULT_PATCH_NAME = 'Itza GP200';

const STORAGE_KEY = 'gp200:defaultPatch';

export interface DefaultPatch {
  slot: number;
  preset: GP200Preset;
}

export function loadDefaultPatch(): DefaultPatch | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { slot?: unknown; preset?: unknown };
    const { slot } = parsed;
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot > 255) return null;
    const preset = GP200PresetSchema.safeParse(parsed.preset);
    if (!preset.success) return null;
    return { slot, preset: preset.data };
  } catch {
    return null;
  }
}

export function saveDefaultPatch(value: DefaultPatch): void {
  // rawSource (the original file bytes) doesn't survive JSON and isn't needed
  // to recognise the patch, so it's left out.
  const { rawSource: _rawSource, ...preset } = value.preset;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ slot: value.slot, preset }));
  } catch {
    // Storage unavailable: the default just won't persist across reloads.
  }
}
