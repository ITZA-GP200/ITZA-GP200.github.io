/**
 * The FX loop's mark: up for the signal leaving, down for it coming back.
 *
 * Shared, because the loop panel and the chain's own markers have to be the
 * same mark — they are two views of one thing, and a reader who learns the
 * triangle in one should not have to learn it again in the other. Solid
 * rather than stroked: at this size a stroked chevron starts to read as two
 * thin lines, and solid is already what the chain uses between cards to mean
 * "the signal goes this way".
 *
 * `currentColor` fills it, so each caller decides the colour.
 */
export function FxTriangle({ dir, size = 15 }: { dir: 'up' | 'down'; size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 11) / 15)}
      viewBox="0 0 24 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={dir === 'up' ? 'M12 2 23 15 1 15Z' : 'M1 1 23 1 12 14Z'} />
    </svg>
  );
}
