"""
Unit tests for canonical JSON decoder.

**Validates: Requirements 12.2, 12.3**
"""

import pytest

from agentpay_canonical_json import CanonicalJsonError, decode, schemas


def test_decode_basic_types():
    """Test decoding of basic JSON types."""
    assert decode(b"true") is True
    assert decode(b"false") is False
    assert decode(b'"hello"') == "hello"
    assert decode(b"42") == 42
    assert decode(b"[1,2,3]") == [1, 2, 3]
    assert decode(b"{}") == {}


def test_decode_from_string():
    """Test that decoder accepts string input."""
    assert decode('{"key":"value"}') == {"key": "value"}


def test_decode_from_bytes():
    """Test that decoder accepts bytes input."""
    assert decode(b'{"key":"value"}') == {"key": "value"}


def test_decode_invalid_json():
    """Test that invalid JSON raises CanonicalJsonError."""
    with pytest.raises(CanonicalJsonError) as exc_info:
        decode(b"{invalid}")
    assert "invalid JSON" in str(exc_info.value)


def test_decode_with_schema_valid():
    """Test decoding with schema validation for valid input."""
    policy_json = b"""{
        "smart_account": "0x1234567890123456789012345678901234567890",
        "per_tx_cap_usdc_micro": "1000000",
        "daily_cap_usdc_micro": "10000000",
        "rolling_24h_spend_usdc_micro": "5000000",
        "updated_at": "2024-01-01T12:00:00Z",
        "schema_version": 1
    }"""
    
    policy = decode(policy_json, schemas.PolicySchema)
    assert policy["smart_account"] == "0x1234567890123456789012345678901234567890"
    assert policy["per_tx_cap_usdc_micro"] == "1000000"


def test_decode_with_schema_invalid():
    """Test that schema validation rejects invalid input."""
    invalid_policy = b"""{
        "smart_account": "not-an-address",
        "per_tx_cap_usdc_micro": "1000000",
        "daily_cap_usdc_micro": "10000000",
        "rolling_24h_spend_usdc_micro": "5000000",
        "updated_at": "2024-01-01T12:00:00Z",
        "schema_version": 1
    }"""
    
    with pytest.raises(CanonicalJsonError) as exc_info:
        decode(invalid_policy, schemas.PolicySchema)
    assert "address" in str(exc_info.value).lower()


def test_decode_round_trip():
    """Test that parse-then-print produces structurally equal value."""
    from agentpay_canonical_json import encode
    
    original = {"z": 1, "a": 2, "nested": {"b": 3}}
    encoded = encode(original)
    decoded = decode(encoded)
    
    # Decoded should have same keys and values
    assert decoded == original
