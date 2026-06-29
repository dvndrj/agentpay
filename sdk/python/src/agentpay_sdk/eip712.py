"""EIP-712 typed data signing with coincurve (secp256k1) and pycryptodome (keccak-256).

Mirrors sdk/typescript/src/eip712.ts.
"""

from typing import Any
from Crypto.Hash import keccak
from coincurve import PrivateKey


def sign_typed_data(private_key_hex: str, typed_data: dict) -> str:
    """Sign EIP-712 typed data with a secp256k1 private key.

    Args:
        private_key_hex: 32-byte private key as hex (with or without 0x prefix)
        typed_data: EIP-712 typed data dict with ``domain``, ``types``, ``primaryType``, ``message``

    Returns:
        0x-prefixed hex signature (r || s || v, 65 bytes)
    """
    digest = _hash_typed_data(typed_data)

    key_bytes = bytes.fromhex(private_key_hex.replace("0x", ""))
    pk = PrivateKey(key_bytes)
    sig = pk.sign_recoverable(digest)

    # Format: r (32 bytes) || s (32 bytes) || v (1 byte adjusted by 27)
    r = sig[0:32].hex().rjust(64, "0")
    s = sig[32:64].hex().rjust(64, "0")
    v_byte = sig[64] + 27
    v = format(v_byte, "02x")

    return f"0x{r}{s}{v}"


def _hash_typed_data(typed_data: dict) -> bytes:
    """Hash EIP-712 typed data: keccak256(0x1901 || domainSeparator || hashStruct(message))."""
    domain_separator = _hash_struct("EIP712Domain", typed_data["domain"], typed_data["types"])
    message_hash = _hash_struct(
        typed_data["primaryType"], typed_data["message"], typed_data["types"]
    )

    return _keccak(b"\x19\x01" + domain_separator + message_hash)


def _hash_struct(type_name: str, data: dict, types: dict) -> bytes:
    """Hash a struct: keccak256(typeHash || encodeData(data))."""
    # EIP712Domain is always implicit — infer its type from the data keys
    if type_name == "EIP712Domain":
        type_def = _infer_domain_type(data)
    else:
        type_def = types.get(type_name)
        if type_def is None:
            raise ValueError(f"Unknown EIP-712 type: {type_name}")

    type_hash = _hash_type(type_name, type_def, types)
    encoded_data = _encode_data(type_def, data, types)

    return _keccak(type_hash + encoded_data)


def _hash_type(type_name: str, type_def: list, types: dict) -> bytes:
    """Compute type hash: keccak256(encodeType(typeName))."""
    encoded = _encode_type(type_name, type_def, types)
    return _keccak(encoded.encode())


def _encode_type(type_name: str, type_def: list, types: dict) -> str:
    """Encode a type signature string for EIP-712."""
    seen: set[str] = set()
    deps = _collect_deps(type_def, types, seen)

    sorted_deps = sorted(deps)
    result_parts = []

    for dep in sorted_deps:
        dep_def = types.get(dep)
        if dep_def is None:
            continue
        result_parts.append(dep + "(" + ",".join(f"{f['type']} {f['name']}" for f in dep_def) + ")")

    result_parts.append(
        type_name + "(" + ",".join(f"{f['type']} {f['name']}" for f in type_def) + ")"
    )
    return "".join(result_parts)


def _infer_domain_type(domain: dict) -> list[dict]:
    """Infer the EIP712Domain type from the data keys present."""
    FIELD_TYPES = {
        "name": "string",
        "version": "string",
        "chainId": "uint256",
        "verifyingContract": "address",
        "salt": "bytes32",
    }
    return [{"name": key, "type": FIELD_TYPES[key]} for key in FIELD_TYPES if key in domain]


def _collect_deps(type_def: list, types: dict, seen: set[str]) -> set[str]:
    """Collect dependent reference types recursively."""
    import re

    for field in type_def:
        base_type = re.sub(r"\[\d*\]$", "", field["type"])
        if base_type in types and base_type not in seen:
            seen.add(base_type)
            _collect_deps(types[base_type], types, seen)
    return seen


def _encode_data(type_def: list, data: dict, types: dict) -> bytes:
    """Encode struct data for EIP-712."""
    chunks = []
    for field in type_def:
        value = data.get(field["name"])
        encoded = _encode_field(field["type"], value, types)
        chunks.append(encoded)

    return b"".join(chunks)


def _encode_field(field_type: str, value: Any, types: dict) -> bytes:
    """Encode a single field value according to EIP-712 encoding rules."""
    import re

    # Handle array types
    if field_type.endswith("[]"):
        elem_type = field_type[:-2]
        arr = value if isinstance(value, (list, tuple)) else []
        encoded_elems = [_encode_field(elem_type, v, types) for v in arr]
        return _keccak(b"".join(encoded_elems))

    # Reference types (structs)
    if field_type in types:
        return _hash_struct(field_type, value, types)

    # Atomic types
    if field_type == "address":
        return _pad32(bytes.fromhex(str(value).lower().replace("0x", "").rjust(40, "0")))
    elif field_type == "bool":
        return _pad32(bytes([1 if value else 0]))
    elif field_type == "bytes32":
        clean = str(value).replace("0x", "")
        if len(clean) != 64:
            raise ValueError(f"Expected 32-byte hex, got {len(clean) // 2} bytes")
        return bytes.fromhex(clean)
    elif field_type in ("string",):
        return _keccak(str(value).encode())
    elif field_type.startswith("uint"):
        n = int(value)
        return _pad32(n.to_bytes(32, "big", signed=False))
    elif field_type == "bytes":
        if isinstance(value, str):
            return _keccak(bytes.fromhex(value.replace("0x", "")))
        return _keccak(bytes(value))
    else:
        raise ValueError(f"Unsupported EIP-712 type: {field_type}")


def _pad32(data: bytes) -> bytes:
    """Left-pad bytes to 32 bytes."""
    if len(data) > 32:
        return data[-32:]
    return data.rjust(32, b"\x00")


def _keccak(data: bytes) -> bytes:
    """Compute keccak-256 hash."""
    k = keccak.new(digest_bits=256)
    k.update(data)
    return k.digest()
