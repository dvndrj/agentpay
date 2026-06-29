# agentpay-canonical-json

Canonical JSON encoder, decoder, and hash for AgentPay signed records.

## Overview

This package implements RFC 8785 (JSON Canonicalization Scheme) with four AgentPay-specific tightenings:

1. Object keys are sorted lexicographically by UTF-8 code-point order
2. Strings are NFC-normalised before escaping
3. Numbers that could lose IEEE-754 precision are emitted as JSON strings
4. No insignificant whitespace and no trailing newline

## Installation

```bash
pip install agentpay-canonical-json
```

## Usage

```python
from agentpay_canonical_json import encode, decode, hash_value

# Encode to canonical JSON bytes
data = {"amount": "1000000", "recipient": "0x1234..."}
canonical_bytes = encode(data)

# Decode from JSON text
parsed = decode(b'{"key":"value"}')

# Compute SHA-256 hash of canonical encoding
digest = hash_value(data)  # returns bytes (32 bytes)
```

## Schema Validation

```python
from agentpay_canonical_json import decode, schemas

# Decode and validate against a schema
obligation = decode(json_text, schemas.ObligationObjectSchema)
```

## Requirements Validated

- **R12.1**: Canonical JSON serialization for Obligation_Object and Evidence_Envelope
- **R12.2**: Parser and pretty printer for canonical JSON
- **R12.5**: Descriptive errors for schema violations
- **R12.6**: Deterministic serialization (byte-identical for equal inputs)
