"""Agent registration (mirrors sdk/typescript/src/register.ts)."""

from agentpay_canonical_json import encode, hash as canonical_hash

from .client import AgentPayClient
from .eip712 import sign_typed_data
from .types import AgentMetadata, RegisterAgentResponse

_REGISTER_DOMAIN = {
    "name": "AgentPay Identity",
    "version": "1",
}

_REGISTER_TYPES = {
    "Register": [
        {"name": "smartAccount", "type": "address"},
        {"name": "metadataHash", "type": "bytes32"},
    ],
}


def register_agent(
    client: AgentPayClient,
    smart_account: str,
    metadata: AgentMetadata,
    private_key: str,
) -> RegisterAgentResponse:
    """Register a new agent with the AgentPay Identity Registry.

    Args:
        client: The AgentPay API client.
        smart_account: Smart account address (0x...).
        metadata: Agent metadata (name, description, etc.).
        private_key: Smart account private key for EIP-712 signing (hex, 0x-prefixed).

    Returns:
        Registered handle and smart account.
    """
    from dataclasses import asdict

    # 1. Compute metadata hash
    metadata_dict = {k: v for k, v in asdict(metadata).items() if v is not None}
    canonical_bytes = encode(metadata_dict)
    metadata_hash = canonical_hash(metadata_dict)
    metadata_hash_hex = "0x" + metadata_hash.hex()

    # 2. Sign { smartAccount, metadataHash }
    signature = sign_typed_data(
        private_key,
        {
            "domain": _REGISTER_DOMAIN,
            "types": _REGISTER_TYPES,
            "primaryType": "Register",
            "message": {
                "smartAccount": smart_account,
                "metadataHash": metadata_hash_hex,
            },
        },
    )

    # 3. POST /v1/agents
    body = {
        "smartAccount": smart_account,
        "signature": signature,
        "metadata": metadata_dict,
        "metadataHash": metadata_hash_hex,
    }
    data = client.post("/v1/agents", body)
    return RegisterAgentResponse(handle=data["handle"], smart_account=data["smartAccount"])
