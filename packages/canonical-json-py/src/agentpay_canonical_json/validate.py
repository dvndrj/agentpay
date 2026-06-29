"""
Schema validation for canonical JSON values.
"""

import re
import unicodedata
from typing import Any

from .errors import CanonicalJsonError
from .path import join_path
from .schema import (
    ArrayKind,
    EnumKind,
    FieldKind,
    FieldSchema,
    ObjectKind,
    ObjectSchema,
    UnionKind,
)

# Validation patterns
HEX_RE = re.compile(r"^[0-9a-f]+$")
ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
TX_HASH_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")
# RFC 3339 date-time with the literal "Z" UTC offset, as required by the
# AgentPay canonical schemas. Fractional seconds are optional.
RFC3339_Z_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$")
UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
INTEGER_STRING_RE = re.compile(r"^(0|-?[1-9][0-9]*)$")
BASE64_RE = re.compile(r"^[A-Za-z0-9+/]*={0,2}$")


def validate(value: Any, schema: ObjectSchema) -> Any:
    """
    Walk `value` against the schema and raise `CanonicalJsonError` on the
    first violation. Returns the same value untouched on success so callers
    can chain `encode(validate(v, S))`.

    Args:
        value: Value to validate
        schema: Schema to validate against

    Returns:
        The input value unchanged

    Raises:
        CanonicalJsonError: On schema violation
    """
    _validate_object(value, schema, "")
    return value


def _validate_field(value: Any, field_schema: FieldSchema, path: str) -> None:
    if value is None:
        # Null acceptance is handled by the caller (_validate_object), which
        # has access to the surrounding object for the nullable predicate.
        # Reaching this branch with `None` means the caller permitted it.
        return
    _validate_kind(value, field_schema.kind, path)


def _validate_kind(value: Any, kind: FieldKind, path: str) -> None:
    if isinstance(kind, str):
        _validate_scalar(value, kind, path)
        return

    if isinstance(kind, EnumKind):
        if not isinstance(value, str):
            raise CanonicalJsonError(path, f"expected string from enum, got {_type_name(value)}")
        if value not in kind.values:
            raise CanonicalJsonError(
                path, f"value {repr(value)} is not in enum {{{', '.join(kind.values)}}}"
            )
        return

    if isinstance(kind, ObjectKind):
        _validate_object(value, kind.schema, path)
        return

    if isinstance(kind, ArrayKind):
        if not isinstance(value, list):
            raise CanonicalJsonError(path, f"expected array, got {_type_name(value)}")
        for i, item in enumerate(value):
            if item is None:
                raise CanonicalJsonError(join_path(path, i), "null not permitted in array element")
            _validate_kind(item, kind.element, join_path(path, i))
        return

    if isinstance(kind, UnionKind):
        errors: list[str] = []
        for member in kind.members:
            try:
                _validate_kind(value, member, path)
                return
            except CanonicalJsonError as err:
                errors.append(err.reason)
                continue
        raise CanonicalJsonError(path, f"value did not match any union member: {'; '.join(errors)}")


def _validate_scalar(value: Any, kind: str, path: str) -> None:
    if kind == "string":
        if not isinstance(value, str):
            raise CanonicalJsonError(path, f"expected string, got {_type_name(value)}")
        _assert_nfc(value, path)
        return

    if kind == "integer-string":
        if not isinstance(value, str):
            raise CanonicalJsonError(path, f"expected integer-as-string, got {_type_name(value)}")
        if not INTEGER_STRING_RE.match(value):
            raise CanonicalJsonError(
                path, "integer-as-string must be a base-10 integer without leading zeros"
            )
        return

    if kind == "hex":
        if not isinstance(value, str):
            raise CanonicalJsonError(path, f"expected hex string, got {_type_name(value)}")
        if not value or len(value) % 2 != 0 or not HEX_RE.match(value):
            raise CanonicalJsonError(
                path, "hex value must be a non-empty even-length lowercase hex string"
            )
        return

    if kind == "address":
        if not isinstance(value, str):
            raise CanonicalJsonError(path, f"expected 0x-address, got {_type_name(value)}")
        if not ADDRESS_RE.match(value):
            raise CanonicalJsonError(path, "address must match 0x[a-fA-F0-9]{40}")
        return

    if kind == "tx-hash":
        if not isinstance(value, str):
            raise CanonicalJsonError(path, f"expected 0x tx hash, got {_type_name(value)}")
        if not TX_HASH_RE.match(value):
            raise CanonicalJsonError(path, "tx-hash must match 0x[a-fA-F0-9]{64}")
        return

    if kind == "rfc3339-z":
        if not isinstance(value, str):
            raise CanonicalJsonError(path, f"expected RFC3339-Z timestamp, got {_type_name(value)}")
        if not RFC3339_Z_RE.match(value):
            raise CanonicalJsonError(path, "timestamp must be RFC3339 UTC with literal Z suffix")
        return

    if kind == "uuid":
        if not isinstance(value, str):
            raise CanonicalJsonError(path, f"expected UUID, got {_type_name(value)}")
        if not UUID_RE.match(value):
            raise CanonicalJsonError(path, "value is not a well-formed UUID")
        return

    if kind == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            raise CanonicalJsonError(path, f"expected integer, got {_type_name(value)}")
        # Python int is arbitrary precision, but we follow the JavaScript safe range
        MAX_SAFE = 2**53 - 1
        MIN_SAFE = -(2**53 - 1)
        if value > MAX_SAFE or value < MIN_SAFE:
            raise CanonicalJsonError(
                path, "integers outside the IEEE-754 safe range must be passed as integer-string"
            )
        return

    if kind == "boolean":
        if not isinstance(value, bool):
            raise CanonicalJsonError(path, f"expected boolean, got {_type_name(value)}")
        return

    if kind == "base64":
        if not isinstance(value, str):
            raise CanonicalJsonError(path, f"expected base64 string, got {_type_name(value)}")
        if not BASE64_RE.match(value) or len(value) % 4 != 0:
            raise CanonicalJsonError(path, "value is not standard base64")
        return

    raise CanonicalJsonError(path, f"unknown scalar kind: {kind}")


def _validate_object(value: Any, schema: ObjectSchema, path: str) -> None:
    if not isinstance(value, dict) or value is None:
        raise CanonicalJsonError(path, f"expected object ({schema.name}), got {_type_name(value)}")

    closed = schema.closed

    # Reject unknown fields first so error messages point at the actual
    # offender rather than failing later on a missing required field.
    if closed:
        for key in value.keys():
            if key not in schema.fields:
                raise CanonicalJsonError(
                    join_path(path, key), f"unknown field in {schema.name}: {key}"
                )

    for name, field_schema in schema.fields.items():
        child_path = join_path(path, name)
        present = name in value
        child_value = value.get(name)

        if not present:
            if field_schema.optional:
                continue
            raise CanonicalJsonError(child_path, f"missing required field: {name}")

        if child_value is None:
            allowed = field_schema.nullable(value)
            if not allowed:
                raise CanonicalJsonError(child_path, "null is not permitted at this position")
            continue

        _validate_field(child_value, field_schema, child_path)


def _assert_nfc(s: str, path: str) -> None:
    if unicodedata.normalize("NFC", s) != s:
        raise CanonicalJsonError(path, "string is not in Unicode NFC")


def _type_name(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, list):
        return "array"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, int):
        return "integer"
    if isinstance(v, str):
        return "string"
    if isinstance(v, dict):
        return "object"
    return type(v).__name__
