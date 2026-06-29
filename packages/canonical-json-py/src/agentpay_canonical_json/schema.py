"""
Schema descriptor model for AgentPay canonical records.

Descriptors are intentionally minimal: enough to (a) detect the schema
violations called out in R12.5 (unknown field, wrong type, missing
required field, malformed scalar), and (b) determine where `None` is
permitted before encoding. Anything more elaborate belongs in
application-level validation.
"""

from dataclasses import dataclass
from typing import Any, Callable, Literal, Union

# Scalar field kinds
ScalarKind = Literal[
    "string",
    "integer-string",  # decimal integer encoded as a string (e.g. micro-USDC)
    "hex",
    "address",
    "tx-hash",
    "rfc3339-z",
    "uuid",
    "integer",
    "boolean",
    "base64",
]


@dataclass
class EnumKind:
    """Enum field kind with allowed values."""

    values: tuple[str, ...]


@dataclass
class ObjectKind:
    """Nested object field kind."""

    schema: "ObjectSchema"


@dataclass
class ArrayKind:
    """Array field kind with element type."""

    element: "FieldKind"


@dataclass
class UnionKind:
    """Union field kind with multiple alternatives."""

    members: tuple["FieldKind", ...]


# Composite field kind type
FieldKind = Union[ScalarKind, EnumKind, ObjectKind, ArrayKind, UnionKind]


@dataclass
class FieldSchema:
    """
    Schema for a single field in an object.

    Attributes:
        kind: Concrete type or composite descriptor for this field
        optional: When True, the field may be omitted from the value
        nullable: Predicate that returns True when `None` is permitted at this field.
                  Receives the surrounding object so a field's nullability can depend
                  on a sibling field. The default predicate returns False.
    """

    kind: FieldKind
    optional: bool = False
    nullable: Callable[[dict[str, Any]], bool] = lambda _: False


@dataclass
class ObjectSchema:
    """
    Schema for an object with named fields.

    Attributes:
        name: Human-readable name used in error messages
        fields: Ordered field descriptors keyed by field name
        closed: When True, fields not listed in `fields` are rejected as
                `unknown_field`. Defaults to True; AgentPay schemas are closed.
    """

    name: str
    fields: dict[str, FieldSchema]
    closed: bool = True


# Convenience constructors


def field(kind: FieldKind) -> FieldSchema:
    """Declare a required field."""
    return FieldSchema(kind=kind)


def optional(kind: FieldKind) -> FieldSchema:
    """Declare an optional field."""
    return FieldSchema(kind=kind, optional=True)


def nullable_when(kind: FieldKind, predicate: Callable[[dict[str, Any]], bool]) -> FieldSchema:
    """Declare a field that may be None when the predicate holds."""
    return FieldSchema(kind=kind, nullable=predicate)


def always_nullable(kind: FieldKind) -> FieldSchema:
    """Declare a field that may be None unconditionally."""
    return FieldSchema(kind=kind, nullable=lambda _: True)
