import { CanonicalJsonError } from './errors.js';
import { joinPath } from './path.js';

/**
 * Canonical JSON encoder for AgentPay.
 *
 * Implements RFC 8785 (JCS) with four tightenings required by the AgentPay
 * design (see design.md > Canonical JSON):
 *
 *   1. Object keys are sorted lexicographically by UTF-8 code-point order
 *      (equivalent to ascending order over Unicode scalar values; for
 *      well-formed strings the UTF-8 byte order matches code-point order).
 *   2. Strings are NFC-normalised before escaping.
 *   3. Numbers that could lose IEEE-754 precision are emitted as JSON
 *      strings. The encoder enforces this by refusing to emit any JS
 *      `number` that is non-finite, has a fractional part, or whose
 *      magnitude exceeds `Number.MAX_SAFE_INTEGER`. Large or fractional
 *      values must be passed as strings by the caller — the AgentPay
 *      schemas already model amounts and nonces as strings for this
 *      reason, so the encoder simply round-trips strings as-is.
 *   4. No insignificant whitespace and no trailing newline.
 *
 * The encoder also rejects `null` unconditionally; callers that need
 * nullable fields must use the schema descriptors, which carry an explicit
 * `nullable` predicate hook applied during `validate(value, schema)` prior
 * to encoding.
 */

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MIN_SAFE = Number.MIN_SAFE_INTEGER;

/**
 * Encode a value as canonical JSON. Returns the canonical UTF-8 text.
 *
 * `null` is rejected at every position. To emit `null` at a position where
 * a schema permits it, use `validate(value, schema)` first; encoding then
 * proceeds by passing the value (including `null`) to `encodeAllowingNulls`.
 *
 * Most callers should use `encode` directly: AgentPay's schema-allowed
 * `null` positions are wrapped through `validate` upstream, which then
 * calls into the lower-level routine.
 */
export function encode(value: unknown): string {
  return encodeNode(value, '', /* allowNull */ false);
}

/**
 * Encode a value as canonical JSON, permitting `null` at positions the
 * caller has already validated against a schema. Used internally by
 * `validate(value, schema)` once nullability has been checked per-field.
 *
 * @internal
 */
export function encodeAllowingNulls(value: unknown): string {
  return encodeNode(value, '', /* allowNull */ true);
}

function encodeNode(value: unknown, path: string, allowNull: boolean): string {
  if (value === null) {
    if (allowNull) return 'null';
    throw new CanonicalJsonError(path, 'null is not permitted at this position');
  }
  if (value === undefined) {
    throw new CanonicalJsonError(path, 'undefined cannot be encoded as canonical JSON');
  }

  const t = typeof value;

  if (t === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (t === 'string') {
    return encodeString(value as string);
  }

  if (t === 'number') {
    return encodeNumber(value as number, path);
  }

  if (t === 'bigint') {
    // BigInts always round-trip as strings to avoid precision loss; the
    // schemas declare amounts as strings, so this branch is mostly a
    // safety net for callers passing bigints directly.
    return encodeString((value as bigint).toString(10));
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    let out = '[';
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out += ',';
      out += encodeNode(value[i], joinPath(path, i), allowNull);
    }
    return out + ']';
  }

  if (t === 'object') {
    return encodeObject(value as Record<string, unknown>, path, allowNull);
  }

  throw new CanonicalJsonError(path, `unsupported value type: ${t}`);
}

function encodeObject(obj: Record<string, unknown>, path: string, allowNull: boolean): string {
  const keys = Object.keys(obj);
  if (keys.length === 0) return '{}';

  // Sort by Unicode code-point order. JavaScript's default string sort
  // operates on UTF-16 code units, which differs from code-point order for
  // characters beyond the BMP (surrogate pairs). For correctness with
  // supplementary characters we sort on the array of code points.
  keys.sort(compareByCodePoint);

  let out = '{';
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] as string;
    const child = obj[key];
    if (child === undefined) {
      // Skip undefined entirely — matches JSON.stringify semantics for
      // own-enumerable undefined values and prevents accidental "null"
      // injection. Schemas mark optional fields explicitly; absence is
      // canonical when the field is permitted to be missing.
      continue;
    }
    if (i > 0 && out.length > 1) out += ',';
    out += encodeString(key);
    out += ':';
    out += encodeNode(child, joinPath(path, key), allowNull);
  }
  return out + '}';
}

function compareByCodePoint(a: string, b: string): number {
  // Iterate over Unicode code points (the string iterator yields code
  // points, joining surrogate pairs). For the vast majority of ASCII
  // schema keys this loop runs in a few iterations.
  const ai = a[Symbol.iterator]();
  const bi = b[Symbol.iterator]();
  for (;;) {
    const ar = ai.next();
    const br = bi.next();
    if (ar.done && br.done) return 0;
    if (ar.done) return -1;
    if (br.done) return 1;
    const ac = (ar.value as string).codePointAt(0) ?? 0;
    const bc = (br.value as string).codePointAt(0) ?? 0;
    if (ac !== bc) return ac - bc;
  }
}

function encodeNumber(n: number, path: string): string {
  if (!Number.isFinite(n)) {
    throw new CanonicalJsonError(path, 'non-finite numbers cannot be encoded');
  }
  if (!Number.isInteger(n)) {
    throw new CanonicalJsonError(
      path,
      'fractional numbers must be passed as strings to preserve precision',
    );
  }
  if (n > MAX_SAFE || n < MIN_SAFE) {
    throw new CanonicalJsonError(
      path,
      'integers outside the IEEE-754 safe range must be passed as strings',
    );
  }
  // Safe integers serialise unambiguously via Number.prototype.toString.
  return n.toString(10);
}

/**
 * Encode a string per RFC 8785 escaping rules, with NFC normalisation
 * applied first.
 *
 * The escape set is:
 *   - U+0022 QUOTATION MARK and U+005C REVERSE SOLIDUS are escaped as
 *     `\"` and `\\` respectively.
 *   - U+0008..U+000D have short escapes (`\b`, `\t`, `\n`, `\f`, `\r`).
 *   - All other control characters in U+0000..U+001F are escaped as
 *     `\u00XX` using lowercase hex (per RFC 8785).
 *   - All other code points are emitted verbatim (UTF-8 on the wire when
 *     the returned string is utf8-encoded).
 */
function encodeString(raw: string): string {
  const s = raw.normalize('NFC');
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    switch (c) {
      case 0x22:
        out += '\\"';
        continue;
      case 0x5c:
        out += '\\\\';
        continue;
      case 0x08:
        out += '\\b';
        continue;
      case 0x09:
        out += '\\t';
        continue;
      case 0x0a:
        out += '\\n';
        continue;
      case 0x0c:
        out += '\\f';
        continue;
      case 0x0d:
        out += '\\r';
        continue;
      default:
        if (c < 0x20) {
          out += '\\u' + c.toString(16).padStart(4, '0');
        } else {
          out += s[i];
        }
    }
  }
  return out + '"';
}
