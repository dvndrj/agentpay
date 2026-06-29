"""
Canonical JSON decoder for AgentPay.
"""

import json
from typing import Any, Optional, overload

from .errors import CanonicalJsonError
from .schema import ObjectSchema
from .validate import validate


@overload
def decode(data: bytes | str) -> Any: ...


@overload
def decode(data: bytes | str, schema: ObjectSchema) -> Any: ...


def decode(data: bytes | str, schema: Optional[ObjectSchema] = None) -> Any:
    """
    Decode canonical JSON text into a Python value.

    Accepts any RFC 8259 JSON; canonical-form constraints (key order, NFC,
    whitespace) are enforced by the encoder when round-tripping. If you
    need schema validation, pass an `ObjectSchema` as the second argument:
    `decode(text, ObligationObjectSchema)`.

    Args:
        data: JSON text as bytes or string
        schema: Optional schema to validate against

    Returns:
        Parsed Python value

    Raises:
        CanonicalJsonError: If JSON is invalid or fails schema validation
    """
    if isinstance(data, bytes):
        text = data.decode("utf-8")
    elif isinstance(data, str):
        text = data
    else:
        raise CanonicalJsonError("", "decode input must be bytes or string")

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as err:
        raise CanonicalJsonError("", f"invalid JSON: {err.msg}") from err

    if schema:
        validate(parsed, schema)

    return parsed
