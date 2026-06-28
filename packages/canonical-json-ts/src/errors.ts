/**
 * Thrown when a value cannot be encoded as canonical JSON or fails schema validation.
 *
 * The `path` is a JSON-pointer-style string (RFC 6901) identifying the
 * offending field (e.g. `/charge/amount_usdc_micro`). The root is the empty
 * string. The `reason` is a short, machine-readable description suitable for
 * surfacing in error envelopes.
 */
export class CanonicalJsonError extends Error {
  public readonly path: string;
  public readonly reason: string;

  constructor(path: string, reason: string) {
    super(`${path || '/'}: ${reason}`);
    this.name = 'CanonicalJsonError';
    this.path = path;
    this.reason = reason;
    // Preserve prototype chain across down-level targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
