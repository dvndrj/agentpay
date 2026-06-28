/**
 * Build a JSON-pointer (RFC 6901) path from a sequence of segments.
 *
 * Segments are escaped per RFC 6901: `~` → `~0`, `/` → `~1`.
 * The empty path (root) is represented as the empty string.
 */
export function joinPath(parent: string, segment: string | number): string {
  const escaped =
    typeof segment === 'number'
      ? String(segment)
      : segment.replace(/~/g, '~0').replace(/\//g, '~1');
  return `${parent}/${escaped}`;
}
