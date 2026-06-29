"""
Canonical JSON encoder for AgentPay.

Implements RFC 8785 (JCS) with four tightenings required by the AgentPay
design (see design.md > Canonical JSON):

  1. Object keys are sorted lexicographically by UTF-8 code-point order
     (equivalent to ascending order over Unicode scalar values; for
     well-formed strings the UTF-8 byte order matches code-point order).
  2. Strings are NFC-normalised before escaping.
  3. Numbers that could lose IEEE-754 precision are emitted as JSON
     strings. The encoder enforces this by refusing to emit any Python
     `int` or `float` that is non-finite, has a fractional part (for float),
     or whose magnitude exceeds the safe integer range. Large or fractional
     values must be passed as strings by the caller — the AgentPay
     schemas already model amounts and nonces as strings for this
     reason, so the encoder simply round-trips strings as-is.
  4. No insignificant whitespace and no trailing newline.

The encoder also rejects `None` unconditionally; callers that need
nullable fields must use the schema descriptors, which carry an explicit
`nullable` predicate hook applied during `validate(value, schema)` prior
to encoding.
"""

import sys
import unicodedata
from decimal import Decimal
from typing import Any

from .errors import CanonicalJsonError
from .path import join_path

# Python int is arbitrary precision, but we follow the JavaScript safe integer range
# for cross-platform consistency (IEEE-754 double-precision safe range)
MAX_SAFE = 2**53 - 1  # 9007199254740991
MIN_SAFE = -(2**53 - 1)


def encode(value: Any) -> bytes:
    """
    Encode a value as canonical JSON. Returns the canonical UTF-8 bytes.

    `None` is rejected at every position. To emit `None` at a position where
    a schema permits it, use `validate(value, schema)` first; encoding then
    proceeds by passing the value (including `None`) to `_encode_allowing_nulls`.

    Most callers should use `encode` directly: AgentPay's schema-allowed
    `None` positions are wrapped through `validate` upstream, which then
    calls into the lower-level routine.
    """
    text = _encode_node(value, "", allow_null=False)
    return text.encode("utf-8")


def _encode_allowing_nulls(value: Any) -> bytes:
    """
    Encode a value as canonical JSON, permitting `None` at positions the
    caller has already validated against a schema. Used internally by
    `validate(value, schema)` once nullability has been checked per-field.
    """
    text = _encode_node(value, "", allow_null=True)
    return text.encode("utf-8")


def _encode_node(value: Any, path: str, allow_null: bool) -> str:
    if value is None:
        if allow_null:
            return "null"
        raise CanonicalJsonError(path, "null is not permitted at this position")

    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, str):
        return _encode_string(value)

    if isinstance(value, int) and not isinstance(value, bool):
        return _encode_integer(value, path)

    if isinstance(value, float):
        return _encode_float(value, path)

    if isinstance(value, Decimal):
        # Decimal for large numerics held as strings
        return _encode_string(str(value))

    if isinstance(value, list):
        if not value:
            return "[]"
        parts = [_encode_node(item, join_path(path, i), allow_null) for i, item in enumerate(value)]
        return "[" + ",".join(parts) + "]"

    if isinstance(value, dict):
        return _encode_object(value, path, allow_null)

    raise CanonicalJsonError(path, f"unsupported value type: {type(value).__name__}")


def _encode_object(obj: dict[str, Any], path: str, allow_null: bool) -> str:
    if not obj:
        return "{}"

    # Sort by Unicode code-point order. Python 3 strings compare by code point
    # natively, so sorted() gives us the correct order.
    keys = sorted(obj.keys())

    parts = []
    for key in keys:
        child = obj[key]
        # Skip undefined (not present in Python), but we handle None separately
        if child is None and not allow_null:
            # If we reach here, None is not allowed; will be caught in _encode_node
            pass
        parts.append(_encode_string(key) + ":" + _encode_node(child, join_path(path, key), allow_null))

    return "{" + ",".join(parts) + "}"


def _encode_integer(n: int, path: str) -> str:
    if n > MAX_SAFE or n < MIN_SAFE:
        raise CanonicalJsonError(
            path, "integers outside the IEEE-754 safe range must be passed as strings"
        )
    # Safe integers serialise unambiguously
    return str(n)


def _encode_float(n: float, path: str) -> str:
    if not (n == n):  # NaN check
        raise CanonicalJsonError(path, "non-finite numbers cannot be encoded")
    if n == float("inf") or n == float("-inf"):
        raise CanonicalJsonError(path, "non-finite numbers cannot be encoded")
    if n != int(n):
        raise CanonicalJsonError(
            path, "fractional numbers must be passed as strings to preserve precision"
        )
    # If it's a whole number, treat as integer
    return _encode_integer(int(n), path)


def _encode_string(raw: str) -> str:
    """
    Encode a string per RFC 8785 escaping rules, with NFC normalisation
    applied first.

    The escape set is:
      - U+0022 QUOTATION MARK and U+005C REVERSE SOLIDUS are escaped as
        `\\"` and `\\\\` respectively.
      - U+0008..U+000D have short escapes (`\\b`, `\\t`, `\\n`, `\\f`, `\\r`).
      - All other control characters in U+0000..U+001F are escaped as
        `\\u00XX` using lowercase hex (per RFC 8785).
      - All other code points are emitted verbatim (UTF-8 on the wire when
        the returned string is utf8-encoded).
    """
    s = unicodedata.normalize("NFC", raw)
    out = '"'
    for char in s:
        code = ord(char)
        if code == 0x22:
            out += '\\"'
        elif code == 0x5C:
            out += "\\\\"
        elif code == 0x08:
            out += "\\b"
        elif code == 0x09:
            out += "\\t"
        elif code == 0x0A:
            out += "\\n"
        elif code == 0x0C:
            out += "\\f"
        elif code == 0x0D:
            out += "\\r"
        elif code < 0x20:
            out += f"\\u{code:04x}"
        else:
            out += char
    return out + '"'
