"""
agentpay_canonical_json — canonical JSON encoder, decoder, hash, and
schema descriptors for AgentPay signed records.

See `.kiro/specs/agentpay-platform/design.md` > Canonical JSON for the
normative encoding spec (RFC 8785 + four AgentPay tightenings).
"""

from .decoder import decode
from .encoder import encode
from .errors import CanonicalJsonError
from .hash import hash as hash_value
from .schema import (
    FieldKind,
    FieldSchema,
    ObjectSchema,
    always_nullable,
    field,
    nullable_when,
    optional,
)
from .validate import validate

# Import schemas module for convenience
from . import schemas

__all__ = [
    "CanonicalJsonError",
    "encode",
    "decode",
    "hash_value",
    "validate",
    "field",
    "optional",
    "nullable_when",
    "always_nullable",
    "FieldKind",
    "FieldSchema",
    "ObjectSchema",
    "schemas",
]
