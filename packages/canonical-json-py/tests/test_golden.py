"""
Golden vector cross-language interop tests.

**Validates: Requirements 12.6**

These tests ensure that the TypeScript and Python canonical JSON
implementations produce byte-identical output for the same input fixtures.
Each golden vector file contains:
- description: What the test covers
- input: The JSON value to encode
- expected_bytes: The exact canonical UTF-8 output as a string
- notes: Additional context

The same fixtures live in both packages/canonical-json-ts/test/golden/
and packages/canonical-json-py/tests/golden/ to ensure cross-language
compatibility.
"""

import json
from pathlib import Path

import pytest

from agentpay_canonical_json import encode
from agentpay_canonical_json.encoder import _encode_allowing_nulls


def get_golden_files():
    """Get all golden vector JSON files from the golden directory."""
    golden_dir = Path(__file__).parent / "golden"
    return sorted(golden_dir.glob("*.json"))


@pytest.mark.parametrize("fixture_path", get_golden_files())
def test_golden_vector(fixture_path: Path):
    """Test each golden vector file for exact byte match."""
    with open(fixture_path, "r", encoding="utf-8") as f:
        fixture = json.load(f)

    input_value = fixture["input"]
    expected_bytes = fixture["expected_bytes"]
    description = fixture["description"]

    # Some fixtures include null values and need _encode_allowing_nulls
    fixture_str = json.dumps(input_value)
    has_null = "null" in fixture_str

    if has_null:
        actual = _encode_allowing_nulls(input_value)
    else:
        actual = encode(input_value)

    # Convert expected string to bytes for comparison
    expected = expected_bytes.encode("utf-8")

    if actual != expected:
        print(f"\nDescription: {description}")
        print(f"Expected: {expected}")
        print(f"Actual:   {actual}")

    assert actual == expected, f"Golden vector mismatch for {fixture_path.name}"


def test_has_sufficient_golden_vectors():
    """Ensure we have comprehensive coverage with at least 8 golden vectors."""
    golden_files = get_golden_files()
    assert len(golden_files) >= 8, f"Expected at least 8 golden vectors, found {len(golden_files)}"


def test_nfc_normalization_combining_characters():
    """Test NFC normalization of combining characters."""
    # "café" with NFD combining acute accent
    nfd_cafe = {"cafe\u0301": "re\u0301sume\u0301"}
    # Should normalize to NFC precomposed forms
    result = encode(nfd_cafe)
    assert result == b'{"caf\xc3\xa9":"r\xc3\xa9sum\xc3\xa9"}'  # UTF-8 encoded NFC


def test_key_sorting_supplementary_plane():
    """Test key sorting with supplementary plane characters."""
    # Emoji (U+1F600) should sort after BMP letters by code point
    input_value = {"z": 1, "\U0001F600": 2, "a": 3}
    result = encode(input_value).decode("utf-8")
    # BMP 'a' and 'z' come before emoji U+1F600
    assert result.index('"a"') < result.index('"\U0001F600"')
    assert result.index('"z"') < result.index('"\U0001F600"')


def test_null_values_serialize_correctly():
    """Test null values serialize correctly when allowed."""
    input_value = {"a": None, "b": "present", "c": None}
    result = _encode_allowing_nulls(input_value)
    assert result == b'{"a":null,"b":"present","c":null}'


def test_integer_boundary_values():
    """Test integer boundary values."""
    max_safe = 2**53 - 1  # 9007199254740991
    min_safe = -(2**53 - 1)
    input_value = {"max": max_safe, "min": min_safe, "zero": 0}
    result = encode(input_value)
    expected = f'{{"max":{max_safe},"min":{min_safe},"zero":0}}'.encode("utf-8")
    assert result == expected


def test_deeply_nested_key_sorting():
    """Test deeply nested objects maintain key sorting at each level."""
    input_value = {
        "z": {"z": 1, "a": 2},
        "a": {"z": 3, "a": 4},
    }
    result = encode(input_value)
    assert result == b'{"a":{"a":4,"z":3},"z":{"a":2,"z":1}}'


def test_control_character_escaping():
    """Test control character escaping per RFC 8785."""
    input_value = {
        "tab": "\t",
        "newline": "\n",
        "null_byte": "\x00",
        "backslash": "\\",
        "quote": '"',
    }
    result = encode(input_value)
    # Keys sorted: backslash, newline, null_byte, quote, tab
    expected = b'{"backslash":"\\\\","newline":"\\n","null_byte":"\\u0000","quote":"\\"","tab":"\\t"}'
    assert result == expected
