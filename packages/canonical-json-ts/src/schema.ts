/**
 * Schema descriptor model for AgentPay canonical records.
 *
 * Descriptors are intentionally minimal: enough to (a) detect the schema
 * violations called out in R12.5 (unknown field, wrong type, missing
 * required field, malformed scalar), and (b) determine where `null` is
 * permitted before encoding. Anything more elaborate belongs in
 * application-level validation.
 */

export type FieldKind =
  | 'string'
  | 'integer-string' // decimal integer encoded as a string (e.g. micro-USDC)
  | 'hex'
  | 'address'
  | 'tx-hash'
  | 'rfc3339-z'
  | 'uuid'
  | 'integer'
  | 'boolean'
  | 'base64'
  | { enum: readonly string[] }
  | { object: ObjectSchema }
  | { array: FieldKind }
  | { union: readonly FieldKind[] };

export interface FieldSchema {
  /** Concrete type or composite descriptor for this field. */
  readonly kind: FieldKind;
  /** When true, the field may be omitted from the value. Defaults to false. */
  readonly optional?: boolean;
  /**
   * Predicate that returns true when `null` is permitted at this field.
   * Receives the surrounding object so a field's nullability can depend
   * on a sibling field (for example, `tx_hash` is nullable when
   * `finality_state === 'DRAFT'`). The default predicate returns false.
   */
  readonly nullable?: (parent: Readonly<Record<string, unknown>>) => boolean;
}

export interface ObjectSchema {
  /** Human-readable name used in error messages. */
  readonly name: string;
  /** Ordered field descriptors keyed by field name. */
  readonly fields: Readonly<Record<string, FieldSchema>>;
  /**
   * When true, fields not listed in `fields` are rejected as
   * `unknown_field`. Defaults to true; AgentPay schemas are closed.
   */
  readonly closed?: boolean;
}

/** Convenience: declare a required field. */
export function field(kind: FieldKind): FieldSchema {
  return { kind };
}

/** Convenience: declare an optional field. */
export function optional(kind: FieldKind): FieldSchema {
  return { kind, optional: true };
}

/** Convenience: declare a field that may be null when the predicate holds. */
export function nullableWhen(
  kind: FieldKind,
  predicate: (parent: Readonly<Record<string, unknown>>) => boolean,
): FieldSchema {
  return { kind, nullable: predicate };
}

/** Convenience: declare a field that may be null unconditionally. */
export function alwaysNullable(kind: FieldKind): FieldSchema {
  return { kind, nullable: () => true };
}
