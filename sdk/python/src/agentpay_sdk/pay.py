"""x402 payment settlement (mirrors sdk/typescript/src/pay.ts)."""

from uuid6 import uuid7

from .client import AgentPayClient
from .eip712 import sign_typed_data
from .x402 import parse_x402_header, AgentPaySdkError
from .types import ChargeRequest, SessionKey, SettleResponse

_PAYMENT_REQUEST_DOMAIN = {
    "name": "AgentPay Payment",
    "version": "1",
}

_PAYMENT_REQUEST_TYPES = {
    "PaymentRequest": [
        {"name": "smartAccount", "type": "address"},
        {"name": "slaId", "type": "bytes32"},
        {"name": "amountUsdcMicro", "type": "uint256"},
        {"name": "asset", "type": "string"},
        {"name": "network", "type": "string"},
        {"name": "recipient", "type": "address"},
        {"name": "nonce", "type": "string"},
        {"name": "sessionKeyId", "type": "bytes32"},
        {"name": "requestId", "type": "bytes32"},
        {"name": "submittedAt", "type": "string"},
    ],
}

# Base USDC addresses
_USDC_ADDRESSES = {
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  # Base mainnet
    84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  # Base Sepolia
}


def pay(
    client: AgentPayClient,
    x402_header: str,
    smart_account: str,
    sla_id: str,
    session_key: SessionKey,
    rpc_url: str,
) -> SettleResponse:
    """Pay an x402 charge using a session key.

    Args:
        client: The AgentPay API client.
        x402_header: Charge-Request header string from the HTTP 402 response.
        smart_account: Consumer's smart account address.
        sla_id: SLA being paid against (UUIDv7).
        session_key: Session key for signing (key_id + private_key).
        rpc_url: Base L2 RPC URL for chain reads.

    Returns:
        Settlement receipt with txHash, obligationId, policyDecisionId.
    """
    # 1. Parse x402 charge header
    charge = parse_x402_header(x402_header)

    # 2. Read USDC balance via web3.py
    _check_usdc_balance(charge, smart_account, rpc_url)

    # 3. Construct PaymentRequest
    request_id = str(uuid7())
    submitted_at = _iso_now()

    payment_request = {
        "smartAccount": smart_account,
        "slaId": sla_id,
        "amountUsdcMicro": charge.amount,
        "asset": charge.asset,
        "network": charge.network,
        "recipient": charge.recipient,
        "nonce": charge.nonce,
        "sessionKeyId": session_key.key_id,
        "requestId": request_id,
        "submittedAt": submitted_at,
    }

    # 4. Sign PaymentRequest with session key (EIP-712, coincurve)
    session_key_signature = sign_typed_data(
        session_key.private_key,
        {
            "domain": _PAYMENT_REQUEST_DOMAIN,
            "types": _PAYMENT_REQUEST_TYPES,
            "primaryType": "PaymentRequest",
            "message": {
                "smartAccount": payment_request["smartAccount"],
                "slaId": _uuid_to_bytes32(payment_request["slaId"]),
                "amountUsdcMicro": int(payment_request["amountUsdcMicro"]),
                "asset": payment_request["asset"],
                "network": payment_request["network"],
                "recipient": payment_request["recipient"],
                "nonce": payment_request["nonce"],
                "sessionKeyId": _uuid_to_bytes32(payment_request["sessionKeyId"]),
                "requestId": _uuid_to_bytes32(payment_request["requestId"]),
                "submittedAt": payment_request["submittedAt"],
            },
        },
    )

    # 5. Build settle request body
    settle_request = {
        "charge": {
            "amount": charge.amount,
            "asset": charge.asset,
            "recipient": charge.recipient,
            "network": charge.network,
            "nonce": charge.nonce,
        },
        "smartAccount": smart_account,
        "slaId": sla_id,
        "sessionKeyId": session_key.key_id,
        "sessionKeySignature": session_key_signature,
        "schemaVersion": 1,
    }

    # 6. POST /v1/settle
    data = client.post("/v1/settle", settle_request)
    return SettleResponse(
        tx_hash=data["txHash"],
        obligation_id=data["obligationId"],
        policy_decision_id=data["policyDecisionId"],
    )


def _check_usdc_balance(charge: ChargeRequest, smart_account: str, rpc_url: str) -> None:
    """Pre-flight USDC balance check via web3.py."""
    try:
        from web3 import Web3
    except ImportError:
        return  # web3 not installed; skip pre-flight

    chain_id = 8453 if charge.network == "base-mainnet" else 84532
    usdc_addr = _USDC_ADDRESSES.get(chain_id)
    if not usdc_addr:
        return

    try:
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not w3.is_connected():
            return
    except Exception:
        return

    erc20_abi = [
        {
            "constant": True,
            "inputs": [{"name": "_owner", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "balance", "type": "uint256"}],
            "type": "function",
        },
    ]

    try:
        contract = w3.eth.contract(address=Web3.to_checksum_address(usdc_addr), abi=erc20_abi)
        balance = contract.functions.balanceOf(Web3.to_checksum_address(smart_account)).call()

        if balance < int(charge.amount):
            raise AgentPaySdkError(
                "insufficient_balance",
                f"USDC balance {balance} is less than charge amount {charge.amount}",
            )
    except AgentPaySdkError:
        raise
    except Exception:
        pass  # Chain read failed; let Policy_Engine catch it


def _uuid_to_bytes32(uuid_str: str) -> str:
    """Convert a UUIDv7 string to a 0x-prefixed 64-char hex."""
    hex_str = uuid_str.replace("-", "")
    return "0x" + hex_str.ljust(64, "0")


def _iso_now() -> str:
    """Return current UTC time as ISO 8601 string."""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
