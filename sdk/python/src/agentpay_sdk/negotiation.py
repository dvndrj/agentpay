"""Negotiation stub (mirrors sdk/typescript/src/negotiation.ts).

MVP: returns a fixed-template SLA with a 24-hour expiry.
Full RFQ/quote/accept flow arrives with Negotiation_Engine (Task 14, post-MVP).
"""

from uuid6 import uuid7
from datetime import datetime, timedelta, timezone

from .client import AgentPayClient
from .types import SLA


def request_quote(client: AgentPayClient, provider_handle: str) -> SLA:
    """Request a quote / SLA from a provider (MVP stub)."""
    return SLA(
        sla_id=str(uuid7()),
        consumer_handle="stub-consumer",
        provider_handle=provider_handle,
        terms={
            "priceUsdcMicro": "0",
            "description": "MVP stub — Negotiation_Engine not yet implemented",
        },
        expires_at=(datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
    )
