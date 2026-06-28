import { createHash } from 'node:crypto';
import { encode } from './encoder.js';

/**
 * Compute `sha256(encode(value))` and return the digest as a `Uint8Array`
 * of length 32.
 *
 * The value is first canonically encoded so the digest is stable across
 * any structurally equal in-memory representation (key order, whitespace,
 * etc.). Use this for signing AgentPay records (Obligation, Evidence,
 * Audit) where deterministic byte-for-byte hashing is required.
 */
export function hash(value: unknown): Uint8Array {
  const canonical = encode(value);
  const digest = createHash('sha256').update(canonical, 'utf8').digest();
  // `digest()` returns a Node Buffer, which is a Uint8Array subtype. Copy
  // into a plain Uint8Array so the return value is a pure web type and
  // not tied to Node's Buffer interface.
  return new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength);
}
