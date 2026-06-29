"""
Canonical JSON hash utilities.
"""

import hashlib
from typing import Any

from .encoder import encode


def hash(value: Any) -> bytes:
    """
    Compute `sha256(encode(value))` and return the digest as bytes of length 32.

    The value is first canonically encoded so the digest is stable across
    any structurally equal in-memory representation (key order, whitespace,
    etc.). Use this for signing AgentPay records (Obligation, Evidence,
    Audit) where deterministic byte-for-byte hashing is required.

    Args:
        value: Python value to hash

    Returns:
        SHA-256 digest as 32 bytes
    """
    canonical = encode(value)
    return hashlib.sha256(canonical).digest()
