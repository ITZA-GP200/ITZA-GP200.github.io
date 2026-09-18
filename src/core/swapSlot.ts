/**
 * The user's swap slot: expendable scratch space SWAP copies a patch through.
 *
 * The pedal can only copy a slot onto another (overwriting it), so exchanging
 * A and B needs somewhere for one of them to wait: B -> swap slot, A -> B,
 * swap slot -> A. Whatever the swap slot held is overwritten by every swap,
 * which is why the user picks it. Only the slot number is stored, in this
 * browser's localStorage; storage failures degrade to "none set".
 */

const STORAGE_KEY = 'gp200:swapSlot';

export function loadSwapSlot(): number | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  // Digits only: Number('') is 0, which would read as slot 1A.
  if (raw === null || !/^\d{1,3}$/.test(raw)) return null;
  const slot = Number(raw);
  return slot <= 255 ? slot : null;
}

export function saveSwapSlot(slot: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(slot));
  } catch {
    // Storage unavailable: the swap slot just won't persist across reloads.
  }
}
