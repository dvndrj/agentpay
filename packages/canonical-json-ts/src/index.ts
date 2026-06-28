/**
 * `@agentpay/canonical-json` — canonical JSON encoder, decoder, hash, and
 * schema descriptors for AgentPay signed records.
 *
 * See `.kiro/specs/agentpay-platform/design.md` > Canonical JSON for the
 * normative encoding spec (RFC 8785 + four AgentPay tightenings).
 */

export { CanonicalJsonError } from './errors.js';
export { encode, encodeAllowingNulls } from './encoder.js';
export { decode } from './decoder.js';
export { hash } from './hash.js';
export { validate } from './validate.js';
export {
  field,
  optional,
  nullableWhen,
  alwaysNullable,
  type FieldKind,
  type FieldSchema,
  type ObjectSchema,
} from './schema.js';
export {
  ObligationObjectSchema,
  EvidenceEnvelopeSchema,
  SLASchema,
  PolicySchema,
  SessionKeySchema,
  AuditRecordSchema,
  TrustScoreSchema,
  PaymentRequestSchema,
  Schemas,
  type SchemaName,
} from './schemas/index.js';
