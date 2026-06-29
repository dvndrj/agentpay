"""AgentPay Python SDK.

Mirrors @agentpay/sdk (TypeScript). Usage::

    from agentpay_sdk import AgentPay

    agentpay = AgentPay(base_url="https://api.agentpay.xyz")

    # Register an agent
    result = agentpay.register_agent(
        "0xSmartAccount...",
        AgentMetadata(name="My Agent", description="Does things"),
        "0xPrivateKey...",
    )

    # Pay an x402 charge
    receipt = agentpay.pay(
        "amount=1000, asset=USDC, recipient=0x..., network=base-sepolia, nonce=...",
        "0xSmartAccount...",
        "sla-uuid...",
        SessionKey(key_id="key-uuid...", private_key="0x..."),
        "https://sepolia.base.org",
    )
"""

from .client import AgentPayClient, AgentPayApiError
from .types import (
    AgentPayConfig,
    AgentMetadata,
    RegisterAgentResponse,
    ChargeRequest,
    SettleResponse,
    SessionKey,
    ObligationResponse,
    PolicyConfig,
    PolicyResponse,
    IssueSessionKeyRequest,
    SessionKeyResponse,
    AgentDiscoveryResult,
    SLA,
    AgentPayError,
)
from .x402 import parse_x402_header, AgentPaySdkError
from .version_check import check_api_version
from .register import register_agent as _register_agent
from .obligation import get_obligation as _get_obligation
from .policy import (
    set_policy as _set_policy,
    issue_session_key as _issue_session_key,
    revoke_session_key as _revoke_session_key,
)
from .pay import pay as _pay
from .discovery import discover_agents as _discover_agents
from .negotiation import request_quote as _request_quote


__all__ = [
    "AgentPay",
    "AgentPayApiError",
    "AgentPaySdkError",
    "parse_x402_header",
    "AgentPayConfig",
    "AgentMetadata",
    "RegisterAgentResponse",
    "ChargeRequest",
    "SettleResponse",
    "SessionKey",
    "ObligationResponse",
    "PolicyConfig",
    "PolicyResponse",
    "IssueSessionKeyRequest",
    "SessionKeyResponse",
    "AgentDiscoveryResult",
    "SLA",
    "AgentPayError",
]


class AgentPay:
    """AgentPay SDK client.

    Wraps the HTTP client with automatic API version checking on first call.
    Provides all 8 SDK surface functions from Task 11.
    """

    def __init__(self, base_url: str, api_key: str | None = None):
        self._client = AgentPayClient(AgentPayConfig(base_url=base_url, api_key=api_key))

    def register_agent(
        self,
        smart_account: str,
        metadata: AgentMetadata,
        private_key: str,
    ) -> RegisterAgentResponse:
        """Register a new agent with the Identity Registry.

        Signs {smartAccount, metadataHash} via EIP-712 (coincurve),
        then POSTs to /v1/agents.
        """
        check_api_version(self._client)
        return _register_agent(self._client, smart_account, metadata, private_key)

    def discover_agents(
        self,
        query: str | None = None,
        min_trust_score: int | None = None,
        limit: int | None = None,
    ) -> list[AgentDiscoveryResult]:
        """Discover agents (MVP stub — always returns [])."""
        check_api_version(self._client)
        return _discover_agents(self._client, query, min_trust_score, limit)

    def request_quote(self, provider_handle: str) -> SLA:
        """Request a quote / SLA from a provider (MVP stub)."""
        check_api_version(self._client)
        return _request_quote(self._client, provider_handle)

    def pay(
        self,
        x402_header: str,
        smart_account: str,
        sla_id: str,
        session_key: SessionKey,
        rpc_url: str,
    ) -> SettleResponse:
        """Pay an x402 charge using a session key.

        Parses x402 header, reads USDC balance via web3.py from Base L2,
        signs PaymentRequest with session key (EIP-712, coincurve),
        and POSTs to /v1/settle.
        """
        check_api_version(self._client)
        return _pay(self._client, x402_header, smart_account, sla_id, session_key, rpc_url)

    def get_obligation(self, obligation_id: str) -> ObligationResponse:
        """Get an obligation by ID."""
        check_api_version(self._client)
        return _get_obligation(self._client, obligation_id)

    def set_policy(self, smart_account: str, config: PolicyConfig) -> PolicyResponse:
        """Set the spending policy for a smart account."""
        check_api_version(self._client)
        return _set_policy(self._client, smart_account, config)

    def issue_session_key(self, request: IssueSessionKeyRequest) -> SessionKeyResponse:
        """Issue a new session key."""
        check_api_version(self._client)
        return _issue_session_key(self._client, request)

    def revoke_session_key(self, key_id: str) -> None:
        """Revoke a session key."""
        check_api_version(self._client)
        _revoke_session_key(self._client, key_id)
