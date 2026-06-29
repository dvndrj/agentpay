"""
Basic usage examples for agentpay-canonical-json package.

This demonstrates the three main functions: encode, decode, and hash_value.
"""

from agentpay_canonical_json import decode, encode, hash_value, schemas, validate

# Example 1: Basic encoding and decoding
print("=" * 60)
print("Example 1: Basic encoding and decoding")
print("=" * 60)

data = {
    "user": "Alice",
    "amount": "1000000",  # Large integers as strings
    "timestamp": "2024-01-01T12:00:00Z",
}

# Encode to canonical JSON bytes
canonical_bytes = encode(data)
print(f"Encoded: {canonical_bytes}")
print(f"Length: {len(canonical_bytes)} bytes")

# Decode back to Python dict
decoded = decode(canonical_bytes)
print(f"Decoded: {decoded}")

# Example 2: Key ordering
print("\n" + "=" * 60)
print("Example 2: Deterministic key ordering")
print("=" * 60)

obj1 = {"z": 1, "a": 2, "m": 3}
obj2 = {"a": 2, "m": 3, "z": 1}

bytes1 = encode(obj1)
bytes2 = encode(obj2)

print(f"Object 1: {obj1}")
print(f"Encoded:  {bytes1}")
print(f"\nObject 2: {obj2}")
print(f"Encoded:  {bytes2}")
print(f"\nByte-identical: {bytes1 == bytes2}")

# Example 3: Hash computation
print("\n" + "=" * 60)
print("Example 3: SHA-256 hash of canonical encoding")
print("=" * 60)

data_to_hash = {"obligation_id": "12345", "amount": "5000000"}
digest = hash_value(data_to_hash)

print(f"Data: {data_to_hash}")
print(f"SHA-256 hash: {digest.hex()}")
print(f"Hash length: {len(digest)} bytes")

# Example 4: Schema validation
print("\n" + "=" * 60)
print("Example 4: Schema validation")
print("=" * 60)

policy = {
    "smart_account": "0x1234567890123456789012345678901234567890",
    "per_tx_cap_usdc_micro": "1000000",
    "daily_cap_usdc_micro": "10000000",
    "rolling_24h_spend_usdc_micro": "5000000",
    "updated_at": "2024-01-01T12:00:00Z",
    "schema_version": 1,
}

try:
    validated = validate(policy, schemas.PolicySchema)
    print("✓ Policy validated successfully")
    print(f"Smart account: {validated['smart_account']}")
    print(f"Per-tx cap: {validated['per_tx_cap_usdc_micro']} micro-USDC")
except Exception as e:
    print(f"✗ Validation failed: {e}")

# Example 5: Round-trip property
print("\n" + "=" * 60)
print("Example 5: Round-trip property")
print("=" * 60)

original = {"b": 2, "a": 1, "nested": {"y": 20, "x": 10}}
print(f"Original: {original}")

# Encode -> Decode -> Encode -> Decode
step1 = encode(original)
step2 = decode(step1)
step3 = encode(step2)
step4 = decode(step3)

print(f"After round-trip: {step4}")
print(f"Structurally equal: {original == step4}")
print(f"Byte-identical encoding: {step1 == step3}")

print("\n" + "=" * 60)
print("All examples completed successfully!")
print("=" * 60)
