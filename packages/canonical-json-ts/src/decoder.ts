import { CanonicalJsonError } from './errors.js';
import type { ObjectSchema } from './schema.js';
import { validate } from './validate.js';

/**
 * Decode canonical JSON text into a JavaScript value.
 *
 * Accepts any RFC 8259 JSON; canonical-form constraints (key order, NFC,
 * whitespace) are enforced by the encoder when round-tripping. If you
 * need schema validation, pass an `ObjectSchema` as the second argument:
 * `decode(text, ObligationObjectSchema)`.
 */
export function decode(text: string): unknown;
export function decode<T>(text: string, schema: ObjectSchema): T;
export function decode(text: string, schema?: ObjectSchema): unknown {
  if (typeof text !== 'string') {
    throw new CanonicalJsonError('', 'decode input must be a string');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'invalid JSON';
    throw new CanonicalJsonError('', `invalid JSON: ${reason}`);
  }
  if (schema) {
    validate(parsed, schema);
  }
  return parsed;
}
