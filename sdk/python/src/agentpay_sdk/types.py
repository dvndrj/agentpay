"""AgentPay SDK — public types (mirrors sdk/typescript/src/types.ts)."""

from dataclasses import dataclass, field
from typing import Optional, Literal


# ── Client Configuration ────────────────────────────────────────


@dataclass
class AgentPayConfig:
    """SDK client configuration."""

    base_url: str
    api_key: Optional[str] = None


# ── Registration ────────────────────────────────────────────────


@dataclass
class AgentMetadata:
    """Agent metadata for registration."""

    name: str
    description: Optional[str] = None
    endpoint_url: Optional[str] = None
    contact_email: Optional[str] = None
    extras: Optional[dict] = None


@dataclass
class RegisterAgentResponse:
    handle: str
    smart_account: str


# ── x402 Payment ────────────────────────────────────────────────

Network = Literal["base-mainnet", "base-sepolia"]


@dataclass
class ChargeRequest:
    amount: str
    asset: Literal["USDC"] = "USDC"
    recipient: str = ""
    network: Network = "base-sepolia"
    nonce: str = ""


@dataclass
class SettleResponse:
    tx_hash: str
    obligation_id: str
    policy_decision_id: str


@dataclass
class SessionKey:
    """Session key for signing PaymentRequests."""

    key_id: str
    private_key: str  # hex-encoded, never sent over the wire


# ── Obligations ─────────────────────────────────────────────────

FinalityState = Literal["DRAFT", "PROVISIONAL", "FINAL", "REVERSED"]


@dataclass
class ObligationResponse:
    obligation_id: str
    sla_id: str
    consumer_handle: str
    provider_handle: str
    consumer_smart_account: str
    provider_smart_account: str
    amount_usdc_micro: str
    asset: str
    network: str
    nonce: str
    finality_state: FinalityState
    policy_decision_id: str
    tx_hash: Optional[str]
    evidence_hash: Optional[str]
    created_at: str


# ── Policy ──────────────────────────────────────────────────────


@dataclass
class PolicyConfig:
    per_tx_cap_usdc_micro: str
    daily_cap_usdc_micro: str


@dataclass
class PolicyResponse:
    smart_account: str
    per_tx_cap_usdc_micro: str
    daily_cap_usdc_micro: str
    rolling_24h_spend_usdc_micro: str
    remaining_daily_usdc_micro: str
    updated_at: str


# ── Session Keys ────────────────────────────────────────────────


@dataclass
class SessionKeyBounds:
    per_tx_cap_usdc_micro: str
    cumulative_cap_usdc_micro: str
    allowed_recipients: Optional[list[str]] = None


@dataclass
class IssueSessionKeyRequest:
    key_id: str
    smart_account: str
    public_key: str
    not_before: str
    not_after: str
    bounds: SessionKeyBounds


SessionKeyStatus = Literal["ACTIVE", "REVOKED", "EXPIRED"]


@dataclass
class SessionKeyResponse:
    key_id: str
    smart_account: str
    public_key: str
    not_before: str
    not_after: str
    bounds: SessionKeyBounds
    status: SessionKeyStatus
    issued_at: str
    revoked_at: Optional[str]


# ── Discovery (MVP stub) ────────────────────────────────────────


@dataclass
class AgentDiscoveryResult:
    handle: str
    metadata: AgentMetadata
    trust_score: int


# ── Negotiation (MVP stub) ──────────────────────────────────────


@dataclass
class SLA:
    sla_id: str
    consumer_handle: str
    provider_handle: str
    terms: dict
    expires_at: str


# ── Errors ──────────────────────────────────────────────────────


@dataclass
class AgentPayError:
    code: str
    message: str
    details: Optional[dict] = None
    request_id: Optional[str] = None
    policy_decision_id: Optional[str] = None
