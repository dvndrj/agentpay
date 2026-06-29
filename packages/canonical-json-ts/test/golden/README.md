# Golden Vectors for Cross-Language Interop

**Validates: Requirements 12.6**

This directory contains golden test vectors that ensure the TypeScript and Python canonical JSON implementations produce byte-identical output for identical inputs.

## Purpose

These fixtures enable cross-language compatibility testing between:

- `@agentpay/canonical-json` (TypeScript)
- `agentpay_canonical_json` (Python)

Both implementations must produce identical byte output for the same input to ensure that signatures, hashes, and serialized records are interoperable across the AgentPay platform.

## Fixture Format

Each JSON file contains:

```json
{
  "description": "Human-readable description of what is being tested",
  "input": { ... },
  "expected_bytes": "exact canonical JSON output as string",
  "notes": "Additional context about the test case"
}
```

## Coverage

The golden vectors cover the edge cases specified in Requirement 12.6:

1. **NFC vs NFD normalization** (`unicode-nfc-vs-nfd.json`)
   - Tests that combining characters are normalized to NFC form
   - Example: `é` (U+00E9) vs `e` + combining acute (U+0065 U+0301)

2. **Key collation edge cases** (`key-collation-*.json`)
   - `key-collation-basic.json`: Basic Unicode code point ordering (digits, uppercase, lowercase)
   - `key-collation-supplementary.json`: Supplementary plane characters (emoji beyond BMP)

3. **Integer boundary values** (`integer-boundaries.json`)
   - Safe integers within IEEE-754 range (±2^53-1)
   - Large integers as strings

4. **Nested objects** (`nested-objects.json`)
   - Key sorting at each nesting level
   - Array order preservation

5. **Null placement** (`null-placement.json`)
   - Null values in schema-permitted positions

6. **Control characters** (`control-characters.json`)
   - RFC 8785 escaping rules
   - Short escapes (`\b`, `\t`, `\n`, `\f`, `\r`)
   - Unicode escapes (`\u00XX`)

7. **Full schema example** (`obligation-object-draft.json`)
   - Complete ObligationObject in DRAFT state
   - Demonstrates real-world serialization

## Maintenance

**IMPORTANT**: These fixtures must be kept in sync across both language implementations:

- `packages/canonical-json-ts/test/golden/` (TypeScript)
- `packages/canonical-json-py/tests/golden/` (Python)

When adding or modifying golden vectors:

1. Update the fixture in **both** directories
2. Ensure both test suites pass
3. Verify byte-identical output across languages

## Running Tests

TypeScript:

```bash
cd packages/canonical-json-ts
pnpm vitest --run golden.test.ts
```

Python:

```bash
cd packages/canonical-json-py
python3 -m pytest tests/test_golden.py -v
```
