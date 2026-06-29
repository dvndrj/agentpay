"""x402 charge header parser (mirrors sdk/typescript/src/x402.ts)."""

from .types import ChargeRequest, Network


REQUIRED_FIELDS = ("amount", "asset", "recipient", "network", "nonce")
VALID_NETWORKS = frozenset(["base-mainnet", "base-sepolia"])


class AgentPaySdkError(Exception):
    """SDK-specific error."""

    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def parse_x402_header(header: str) -> ChargeRequest:
    """Parse an x402 charge header string into a typed ChargeRequest.

    Format: ``amount=1000, asset=USDC, recipient=0x..., network=base-sepolia, nonce=uuidv7``
    """
    if not header or not header.strip():
        raise AgentPaySdkError("x402_parse_error", "Empty charge header")

    fields: dict[str, str] = {}

    for pair in header.strip().split(","):
        trimmed = pair.strip()
        if not trimmed:
            continue

        if "=" not in trimmed:
            raise AgentPaySdkError("x402_parse_error", f'Malformed key=value pair: "{trimmed}"')

        eq_index = trimmed.index("=")
        key = trimmed[:eq_index].strip().lower()
        value = trimmed[eq_index + 1 :].strip()

        if key in fields:
            raise AgentPaySdkError("x402_parse_error", f"Duplicate field: {key}")

        fields[key] = value

    # Validate required fields
    for field_name in REQUIRED_FIELDS:
        if field_name not in fields:
            raise AgentPaySdkError("x402_parse_error", f"Missing required field: {field_name}")

    if fields["asset"] != "USDC":
        raise AgentPaySdkError("x402_parse_error", f"Unsupported asset: {fields['asset']}")

    if fields["network"] not in VALID_NETWORKS:
        raise AgentPaySdkError("x402_parse_error", f"Unsupported network: {fields['network']}")

    if not fields["amount"].isdigit():
        raise AgentPaySdkError("x402_parse_error", f"Invalid amount: {fields['amount']}")

    if not _is_hex_address(fields["recipient"]):
        raise AgentPaySdkError("x402_parse_error", f"Invalid recipient: {fields['recipient']}")

    return ChargeRequest(
        amount=fields["amount"],
        asset="USDC",
        recipient=fields["recipient"],
        network=fields["network"],  # type: ignore[arg-type]
        nonce=fields["nonce"],
    )


def _is_hex_address(s: str) -> bool:
    """Check if a string is a valid 0x-prefixed 40-char hex address."""
    if not s.startswith("0x") or len(s) != 42:
        return False
    try:
        int(s[2:], 16)
        return True
    except ValueError:
        return False
