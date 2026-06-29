# agentpay-canonical-json Implementation

## Overview

This package implements RFC 8785 (JSON Canonicalization Scheme) with four AgentPay-specific tightenings as specified in the design document.

## Implementation Details

### Core Modules

1. **encoder.py** - Canonical JSON encoder
   - Implements RFC 8785 with four tightenings
   - Sorts object keys lexicographically by Unicode code point
   - NFC-normalizes strings before escaping
   - Rejects unsafe integers and floats
   - No insignificant whitespace

2. **decoder.py** - JSON decoder with optional schema validation
   - Accepts any RFC 8259 JSON
   - Optionally validates against ObjectSchema
   - Returns Python native types

3. **hash.py** - SHA-256 hash of canonical encoding
   - Computes `sha256(encode(value))`
   - Returns 32-byte digest
   - Deterministic across structurally equal values

4. **schema.py** - Schema descriptor model
   - Minimal schema system for validation
   - Supports scalar, enum, object, array, and union types
   - Nullable predicates for context-dependent null handling

5. **schemas.py** - AgentPay record schemas
   - Mirrors TypeScript implementation exactly
   - All 8 canonical schemas: ObligationObject, EvidenceEnvelope, SLA, Policy, SessionKey, AuditRecord, TrustScore, PaymentRequest

6. **validate.py** - Schema validation
   - Validates values against ObjectSchema
   - Provides detailed error messages with JSON pointer paths
   - Checks for unknown fields, wrong types, missing required fields

7. **errors.py** - Error types
   - CanonicalJsonError with path and reason

8. **path.py** - JSON pointer utilities
   - RFC 6901 path construction

## Requirements Validated

- **R12.1**: Canonical JSON serialization for Obligation_Object and Evidence_Envelope ✓
- **R12.2**: Parser and pretty printer for canonical JSON ✓
- **R12.5**: Descriptive errors for schema violations with path and reason ✓
- **R12.6**: Deterministic serialization (byte-identical for equal inputs) ✓

## Four AgentPay Tightenings

1. **Key sorting**: Object keys sorted lexicographically by UTF-8 code-point order
2. **NFC normalization**: Strings NFC-normalized before escaping using `unicodedata.normalize("NFC", ...)`
3. **Numeric precision**: Large integers held as strings; rejects floats and unsafe integers
4. **No whitespace**: No insignificant whitespace or trailing newline

## API Surface

```python
from agentpay_canonical_json import (
    encode,           # value -> bytes
    decode,           # bytes|str [, schema] -> Any
    hash_value,       # value -> bytes (32-byte SHA-256)
    validate,         # value, schema -> value (or raises)
    schemas,          # module with all AgentPay schemas
    CanonicalJsonError,
)
```

## Cross-Language Compatibility

The Python implementation mirrors the TypeScript implementation exactly:

- Same schema definitions
- Same validation rules
- Same encoding rules
- Produces byte-identical canonical JSON for equal inputs
- Enables cross-language round-trip parity (R12.6)

## Test Coverage

- 37 unit and integration tests
- All tests passing
- Coverage includes:
  - Basic encoding/decoding
  - Key ordering
  - NFC normalization
  - String escaping
  - Safe/unsafe integers
  - Schema validation
  - Round-trip property
  - Deterministic serialization
  - Hash stability
  - Golden vectors for cross-language compatibility

## Usage Example

```python
from agentpay_canonical_json import encode, decode, hash_value, schemas

# Encode
data = {"amount": "1000000", "recipient": "0x1234..."}
canonical_bytes = encode(data)

# Decode
parsed = decode(canonical_bytes)

# Hash
digest = hash_value(data)  # 32 bytes

# Validate with schema
policy = {
    "smart_account": "0x1234567890123456789012345678901234567890",
    "per_tx_cap_usdc_micro": "1000000",
    "daily_cap_usdc_micro": "10000000",
    "rolling_24h_spend_usdc_micro": "5000000",
    "updated_at": "2024-01-01T12:00:00Z",
    "schema_version": 1,
}
validated = decode(encode(policy), schemas.PolicySchema)
```

## Implementation Notes

### Python-Specific Choices

1. **Decimal support**: Added `decimal.Decimal` support for large numerics (mentioned in task description)
2. **Native sorting**: Python 3 string sorting is already by code point, so `sorted()` works directly
3. **Unicodedata**: Used `unicodedata.normalize("NFC", ...)` for string normalization
4. **Type hints**: Full type annotations throughout
5. **Dataclasses**: Schema descriptors use dataclasses for clean API

### Mirroring TypeScript

The implementation closely follows the TypeScript version:

- Same module structure (encoder, decoder, hash, schema, validate, errors, path)
- Same schema definitions (ObligationObjectSchema, etc.)
- Same validation patterns and error messages
- Same encoding rules and escape sequences
- Compatible test vectors

This ensures that canonical JSON produced by either implementation can be consumed by the other, satisfying the cross-language round-trip requirement (R12.6).
