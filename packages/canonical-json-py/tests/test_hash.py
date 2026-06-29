"""
Unit tests for canonical JSON hash.

**Validates: Requirements 12.1, 12.6**
"""

from agentpay_canonical_json import hash_value


def test_hash_returns_32_bytes():
    """Test that hash returns exactly 32 bytes (SHA-256)."""
    digest = hash_value({"key": "value"})
    assert isinstance(digest, bytes)
    assert len(digest) == 32


def test_hash_deterministic():
    """Test that hash is deterministic for structurally equal values."""
    obj1 = {"b": 2, "a": 1}
    obj2 = {"a": 1, "b": 2}
    
    hash1 = hash_value(obj1)
    hash2 = hash_value(obj2)
    
    assert hash1 == hash2


def test_hash_different_for_different_values():
    """Test that different values produce different hashes."""
    hash1 = hash_value({"a": 1})
    hash2 = hash_value({"a": 2})
    
    assert hash1 != hash2


def test_hash_stable_across_calls():
    """Test that hashing the same value multiple times produces the same result."""
    obj = {"user": "Alice", "amount": "1000000"}
    
    hash1 = hash_value(obj)
    hash2 = hash_value(obj)
    hash3 = hash_value(obj)
    
    assert hash1 == hash2 == hash3
