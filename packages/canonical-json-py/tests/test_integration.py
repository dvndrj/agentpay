"""
Integration tests for canonical JSON package.

**Validates: Requirements 12.1, 12.2, 12.3, 12.6**
"""

import pytest

from agentpay_canonical_json import decode, encode, hash_value, schemas, validate


def test_round_trip_property():
    """
    Test round-trip property: parse then encode then parse produces equal value.
    **Validates: Requirement 12.3**
    """
    # Original obligation object
    obligation = {
        "obligation_id": "01234567-89ab-cdef-0123-456789abcdef",
        "sla_id": "98765432-10fe-dcba-9876-543210fedcba",
        "consumer_handle": "12345",
        "provider_handle": "67890",
        "consumer_smart_account": "0x1234567890123456789012345678901234567890",
        "provider_smart_account": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        "amount_usdc": "1000000",
        "asset": "USDC",
        "network": "base-mainnet",
        "nonce": "42",
        "finality_state": "PROVISIONAL",
        "policy_decision_id": "11111111-2222-3333-4444-555555555555",
        "created_at": "2024-01-01T12:00:00.123456Z",
        "tx_hash": "0x" + "a" * 64,
        "evidence_hash": "abcd1234",
        "schema_version": 1,
    }

    # Validate against schema
    validate(obligation, schemas.ObligationObjectSchema)

    # Encode to canonical JSON
    canonical_bytes = encode(obligation)

    # Decode back
    decoded = decode(canonical_bytes)

    # Encode again
    canonical_bytes2 = encode(decoded)

    # Decode again
    decoded2 = decode(canonical_bytes2)

    # All should be equal
    assert decoded == obligation
    assert decoded2 == obligation
    assert canonical_bytes == canonical_bytes2


def test_deterministic_serialization():
    """
    Test deterministic serialization: byte-identical for equal inputs.
    **Validates: Requirement 12.6**
    """
    obj1 = {
        "z": "last",
        "a": "first",
        "m": "middle",
        "nested": {"y": 2, "x": 1},
    }

    obj2 = {
        "nested": {"x": 1, "y": 2},
        "m": "middle",
        "a": "first",
        "z": "last",
    }

    # Encode both (keys should be sorted)
    bytes1 = encode(obj1)
    bytes2 = encode(obj2)

    # Should be byte-identical
    assert bytes1 == bytes2

    # Verify key ordering
    text = bytes1.decode("utf-8")
    assert text.index('"a"') < text.index('"m"') < text.index('"nested"') < text.index('"z"')
    assert text.index('"x"') < text.index('"y"')


def test_hash_stability():
    """
    Test that hash is stable for structurally equal values.
    **Validates: Requirements 12.1, 12.6**
    """
    obj1 = {"b": 2, "a": 1, "c": {"nested": True}}
    obj2 = {"c": {"nested": True}, "a": 1, "b": 2}

    hash1 = hash_value(obj1)
    hash2 = hash_value(obj2)

    assert hash1 == hash2
    assert len(hash1) == 32


def test_schema_validation_with_encode():
    """Test that schema validation works before encoding."""
    # Valid policy
    policy = {
        "smart_account": "0x1234567890123456789012345678901234567890",
        "per_tx_cap_usdc_micro": "1000000",
        "daily_cap_usdc_micro": "10000000",
        "rolling_24h_spend_usdc_micro": "5000000",
        "updated_at": "2024-01-01T12:00:00Z",
        "schema_version": 1,
    }

    # Validate
    validate(policy, schemas.PolicySchema)

    # Encode
    canonical = encode(policy)

    # Should succeed
    assert len(canonical) > 0

    # Decode and validate again
    decoded = decode(canonical, schemas.PolicySchema)
    assert decoded == policy


def test_cross_language_golden_vector():
    """
    Test a golden vector that should match TypeScript implementation.
    This ensures cross-language round-trip parity (R12.6).
    """
    # Simple test vector
    obj = {
        "amount": "1000000",
        "recipient": "0x1234567890123456789012345678901234567890",
        "timestamp": "2024-01-01T00:00:00Z",
    }

    canonical = encode(obj)

    # Expected canonical form (keys sorted, no whitespace)
    expected = b'{"amount":"1000000","recipient":"0x1234567890123456789012345678901234567890","timestamp":"2024-01-01T00:00:00Z"}'

    assert canonical == expected


def test_nfc_normalization_in_round_trip():
    """
    Test that NFC normalization is applied during encoding.
    **Validates: Requirement 12.1 (tightening rule 2)**
    """
    # U+00E9 (é) is NFC; U+0065 U+0301 (e + combining acute) is NFD
    obj_nfc = {"name": "café"}  # precomposed
    obj_nfd = {"name": "café"}  # decomposed (if Python allows it)

    bytes_nfc = encode(obj_nfc)
    bytes_nfd = encode(obj_nfd)

    # Both should produce identical canonical bytes
    assert bytes_nfc == bytes_nfd


def test_large_integer_as_string():
    """
    Test that large integers outside safe range must be strings.
    **Validates: Requirement 12.1 (tightening rule 3)**
    """
    # This would fail if passed as int
    large_amount = "9007199254740992"  # 2^53

    obj = {"amount": large_amount}
    canonical = encode(obj)

    # Should be encoded as a string
    assert b'"9007199254740992"' in canonical

    # Verify it round-trips
    decoded = decode(canonical)
    assert decoded["amount"] == large_amount
