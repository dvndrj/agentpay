"""
Unit tests for canonical JSON encoder.

**Validates: Requirements 12.1, 12.2, 12.6**
"""

import pytest

from agentpay_canonical_json import CanonicalJsonError, encode


def test_encode_basic_types():
    """Test encoding of basic JSON types."""
    assert encode(True) == b"true"
    assert encode(False) == b"false"
    assert encode("hello") == b'"hello"'
    assert encode(42) == b"42"
    assert encode([1, 2, 3]) == b"[1,2,3]"
    assert encode({}) == b"{}"


def test_encode_object_key_ordering():
    """Test that object keys are sorted lexicographically by Unicode code point."""
    obj = {"z": 1, "a": 2, "m": 3}
    result = encode(obj)
    assert result == b'{"a":2,"m":3,"z":1}'


def test_encode_nfc_normalization():
    """Test that strings are NFC-normalized before encoding."""
    # U+00E9 (é) is the NFC form; U+0065 U+0301 (e + combining acute) is NFD
    nfc = "café"  # precomposed é
    nfd = "café"  # decomposed e + combining acute
    # Both should encode to the same canonical form
    assert encode(nfc) == encode(nfd)


def test_encode_string_escaping():
    """Test RFC 8785 string escape rules."""
    # Quote and backslash
    assert encode('"') == b'"\\""'
    assert encode("\\") == b'"\\\\"'
    
    # Control characters with short escapes
    assert encode("\b") == b'"\\b"'
    assert encode("\t") == b'"\\t"'
    assert encode("\n") == b'"\\n"'
    assert encode("\f") == b'"\\f"'
    assert encode("\r") == b'"\\r"'
    
    # Other control characters use \u00XX
    assert encode("\x00") == b'"\\u0000"'
    assert encode("\x1f") == b'"\\u001f"'


def test_encode_no_whitespace():
    """Test that no insignificant whitespace is emitted."""
    obj = {"a": 1, "b": [2, 3], "c": {"d": 4}}
    result = encode(obj)
    assert b" " not in result
    assert b"\n" not in result
    assert b"\t" not in result


def test_encode_rejects_null():
    """Test that None is rejected unconditionally."""
    with pytest.raises(CanonicalJsonError) as exc_info:
        encode(None)
    assert "null is not permitted" in str(exc_info.value)


def test_encode_safe_integers():
    """Test that safe integers (within IEEE-754 safe range) encode correctly."""
    max_safe = 2**53 - 1
    min_safe = -(2**53 - 1)
    assert encode(max_safe) == str(max_safe).encode("utf-8")
    assert encode(min_safe) == str(min_safe).encode("utf-8")


def test_encode_rejects_unsafe_integers():
    """Test that integers outside IEEE-754 safe range are rejected."""
    too_large = 2**53
    too_small = -(2**53)
    
    with pytest.raises(CanonicalJsonError) as exc_info:
        encode(too_large)
    assert "IEEE-754 safe range" in str(exc_info.value)
    
    with pytest.raises(CanonicalJsonError) as exc_info:
        encode(too_small)
    assert "IEEE-754 safe range" in str(exc_info.value)


def test_encode_rejects_floats():
    """Test that fractional numbers are rejected."""
    with pytest.raises(CanonicalJsonError) as exc_info:
        encode(3.14)
    assert "fractional numbers must be passed as strings" in str(exc_info.value)


def test_encode_string_as_integer():
    """Test that large integers passed as strings are encoded correctly."""
    large_int_str = "9007199254740992"  # 2^53, outside safe range
    result = encode(large_int_str)
    assert result == b'"9007199254740992"'


def test_encode_nested_structures():
    """Test encoding of nested objects and arrays."""
    obj = {
        "user": {"name": "Alice", "id": "123"},
        "tags": ["a", "b"],
        "count": 42,
    }
    result = encode(obj)
    # Keys should be sorted
    assert result == b'{"count":42,"tags":["a","b"],"user":{"id":"123","name":"Alice"}}'


def test_encode_deterministic():
    """Test that encoding is deterministic for structurally equal values."""
    obj1 = {"b": 2, "a": 1}
    obj2 = {"a": 1, "b": 2}
    assert encode(obj1) == encode(obj2)
