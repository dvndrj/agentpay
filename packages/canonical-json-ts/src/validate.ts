import { CanonicalJsonError } from './errors.js';
import { joinPath } from './path.js';
import type { FieldKind, FieldSchema, ObjectSchema } from './schema.js';

const HEX_RE = /^[0-9a-f]+$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
// RFC 3339 date-time with the literal "Z" UTC offset, as required by the
// AgentPay canonical schemas. Fractional seconds are optional.
const RFC3339_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const INTEGER_STRING_RE = /^(0|-?[1-9][0-9]*)$/;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Walk `value` against the schema and throw `CanonicalJsonError` on the
 * first violation. Returns the same value untouched on success so callers
 * can chain `encode(validate(v, S))`.
 */
export function validate<T = unknown>(value: unknown, schema: ObjectSchema): T {
  validateObject(value, schema, '');
  return value as T;
}

function validateField(value: unknown, fieldSchema: FieldSchema, path: string): void {
  if (value === null) {
    // Null acceptance is handled by the caller (validateObject), which
    // has access to the surrounding object for the nullable predicate.
    // Reaching this branch with `null` means the caller permitted it.
    return;
  }
  validateKind(value, fieldSchema.kind, path);
}

function validateKind(value: unknown, kind: FieldKind, path: string): void {
  if (typeof kind === 'string') {
    validateScalar(value, kind, path);
    return;
  }
  if ('enum' in kind) {
    if (typeof value !== 'string') {
      throw new CanonicalJsonError(path, `expected string from enum, got ${typeName(value)}`);
    }
    if (!kind.enum.includes(value)) {
      throw new CanonicalJsonError(
        path,
        `value ${JSON.stringify(value)} is not in enum {${kind.enum.join(', ')}}`,
      );
    }
    return;
  }
  if ('object' in kind) {
    validateObject(value, kind.object, path);
    return;
  }
  if ('array' in kind) {
    if (!Array.isArray(value)) {
      throw new CanonicalJsonError(path, `expected array, got ${typeName(value)}`);
    }
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item === null) {
        throw new CanonicalJsonError(joinPath(path, i), 'null not permitted in array element');
      }
      validateKind(item, kind.array, joinPath(path, i));
    }
    return;
  }
  if ('union' in kind) {
    const errors: string[] = [];
    for (const member of kind.union) {
      try {
        validateKind(value, member, path);
        return;
      } catch (err) {
        if (err instanceof CanonicalJsonError) {
          errors.push(err.reason);
          continue;
        }
        throw err;
      }
    }
    throw new CanonicalJsonError(
      path,
      `value did not match any union member: ${errors.join('; ')}`,
    );
  }
}

function validateScalar(value: unknown, kind: Exclude<FieldKind, object>, path: string): void {
  switch (kind) {
    case 'string':
      if (typeof value !== 'string') {
        throw new CanonicalJsonError(path, `expected string, got ${typeName(value)}`);
      }
      assertNfc(value, path);
      return;
    case 'integer-string':
      if (typeof value !== 'string') {
        throw new CanonicalJsonError(
          path,
          `expected integer-as-string, got ${typeName(value)}`,
        );
      }
      if (!INTEGER_STRING_RE.test(value)) {
        throw new CanonicalJsonError(
          path,
          'integer-as-string must be a base-10 integer without leading zeros',
        );
      }
      return;
    case 'hex':
      if (typeof value !== 'string') {
        throw new CanonicalJsonError(path, `expected hex string, got ${typeName(value)}`);
      }
      if (value.length === 0 || value.length % 2 !== 0 || !HEX_RE.test(value)) {
        throw new CanonicalJsonError(
          path,
          'hex value must be a non-empty even-length lowercase hex string',
        );
      }
      return;
    case 'address':
      if (typeof value !== 'string') {
        throw new CanonicalJsonError(path, `expected 0x-address, got ${typeName(value)}`);
      }
      if (!ADDRESS_RE.test(value)) {
        throw new CanonicalJsonError(path, 'address must match 0x[a-fA-F0-9]{40}');
      }
      return;
    case 'tx-hash':
      if (typeof value !== 'string') {
        throw new CanonicalJsonError(path, `expected 0x tx hash, got ${typeName(value)}`);
      }
      if (!TX_HASH_RE.test(value)) {
        throw new CanonicalJsonError(path, 'tx-hash must match 0x[a-fA-F0-9]{64}');
      }
      return;
    case 'rfc3339-z':
      if (typeof value !== 'string') {
        throw new CanonicalJsonError(path, `expected RFC3339-Z timestamp, got ${typeName(value)}`);
      }
      if (!RFC3339_Z_RE.test(value)) {
        throw new CanonicalJsonError(
          path,
          'timestamp must be RFC3339 UTC with literal Z suffix',
        );
      }
      return;
    case 'uuid':
      if (typeof value !== 'string') {
        throw new CanonicalJsonError(path, `expected UUID, got ${typeName(value)}`);
      }
      if (!UUID_RE.test(value)) {
        throw new CanonicalJsonError(path, 'value is not a well-formed UUID');
      }
      return;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new CanonicalJsonError(path, `expected integer, got ${typeName(value)}`);
      }
      if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
        throw new CanonicalJsonError(
          path,
          'integers outside the IEEE-754 safe range must be passed as integer-string',
        );
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new CanonicalJsonError(path, `expected boolean, got ${typeName(value)}`);
      }
      return;
    case 'base64':
      if (typeof value !== 'string') {
        throw new CanonicalJsonError(path, `expected base64 string, got ${typeName(value)}`);
      }
      if (!BASE64_RE.test(value) || value.length % 4 !== 0) {
        throw new CanonicalJsonError(path, 'value is not standard base64');
      }
      return;
    default: {
      // Exhaustiveness guard.
      const _exhaustive: never = kind;
      throw new CanonicalJsonError(path, `unknown scalar kind: ${String(_exhaustive)}`);
    }
  }
}

function validateObject(value: unknown, schema: ObjectSchema, path: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CanonicalJsonError(
      path,
      `expected object (${schema.name}), got ${typeName(value)}`,
    );
  }
  const obj = value as Record<string, unknown>;
  const closed = schema.closed !== false;

  // Reject unknown fields first so error messages point at the actual
  // offender rather than failing later on a missing required field.
  if (closed) {
    for (const key of Object.keys(obj)) {
      if (!(key in schema.fields)) {
        throw new CanonicalJsonError(
          joinPath(path, key),
          `unknown field in ${schema.name}: ${key}`,
        );
      }
    }
  }

  for (const [name, fieldSchema] of Object.entries(schema.fields)) {
    const childPath = joinPath(path, name);
    const present = name in obj;
    const childValue = obj[name];

    if (!present || childValue === undefined) {
      if (fieldSchema.optional) continue;
      throw new CanonicalJsonError(childPath, `missing required field: ${name}`);
    }

    if (childValue === null) {
      const allowed = fieldSchema.nullable?.(obj) ?? false;
      if (!allowed) {
        throw new CanonicalJsonError(childPath, 'null is not permitted at this position');
      }
      continue;
    }

    validateField(childValue, fieldSchema, childPath);
  }
}

function assertNfc(s: string, path: string): void {
  if (s.normalize('NFC') !== s) {
    throw new CanonicalJsonError(path, 'string is not in Unicode NFC');
  }
}

function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
