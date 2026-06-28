# @agentpay/canonical-json

Canonical JSON encoder, decoder, hash, and schema descriptors for AgentPay signed records.

This package implements the encoding spec defined in
`.kiro/specs/agentpay-platform/design.md` (Canonical JSON section):
RFC 8785 (JCS) with four tightenings.

1. Object keys are sorted lexicographically by UTF-8 code-point order.
2. Strings are NFC-normalised before escaping.
3. Numbers that could lose IEEE-754 precision are emitted as JSON strings.
   The schemas declare amounts and nonces as strings to enforce this.
4. No insignificant whitespace and no trailing newline.

## Surface

```ts
import {
  encode,
  decode,
  hash,
  validate,
  CanonicalJsonError,
  ObligationObjectSchema,
  EvidenceEnvelopeSchema,
  SLASchema,
  PolicySchema,
  SessionKeySchema,
  AuditRecordSchema,
  TrustScoreSchema,
  PaymentRequestSchema,
} from '@agentpay/canonical-json';
```

- `encode(value): string` — canonical JSON text.
- `decode(text, schema?): unknown` — parse and optionally validate.
- `hash(value): Uint8Array` — `sha256(encode(value))` as a 32-byte array.
- `validate(value, schema): T` — throws `CanonicalJsonError` with `path` and
  `reason` on the first violation.

## Notes

- `null` is rejected by the encoder unless an explicit schema descriptor
  marks a field as nullable.
- Cross-language parity with `agentpay_canonical_json` (Python) is verified
  by shared golden vectors (task 1.4).
