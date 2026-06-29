"""Obligation queries (mirrors sdk/typescript/src/obligation.ts)."""

from .client import AgentPayClient
from .types import ObligationResponse


def get_obligation(client: AgentPayClient, obligation_id: str) -> ObligationResponse:
    """Get an obligation by ID.

    GET /v1/rails/obligations/:id
    """
    data = client.get(f"/v1/rails/obligations/{obligation_id}")
    return ObligationResponse(
        obligation_id=data["obligationId"],
        sla_id=data["slaId"],
        consumer_handle=data["consumerHandle"],
        provider_handle=data["providerHandle"],
        consumer_smart_account=data["consumerSmartAccount"],
        provider_smart_account=data["providerSmartAccount"],
        amount_usdc_micro=data["amountUsdcMicro"],
        asset=data["asset"],
        network=data["network"],
        nonce=data["nonce"],
        finality_state=data["finalityState"],
        policy_decision_id=data["policyDecisionId"],
        tx_hash=data.get("txHash"),
        evidence_hash=data.get("evidenceHash"),
        created_at=data["createdAt"],
    )
