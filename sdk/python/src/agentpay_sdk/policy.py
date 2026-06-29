"""Policy management (mirrors sdk/typescript/src/policy.ts)."""

from dataclasses import asdict

from .client import AgentPayClient
from .types import PolicyConfig, PolicyResponse, IssueSessionKeyRequest, SessionKeyResponse


def set_policy(
    client: AgentPayClient,
    smart_account: str,
    config: PolicyConfig,
) -> PolicyResponse:
    """Set the spending policy for a smart account.

    PUT /v1/policy/:smartAccount
    """
    data = client.put(f"/v1/policy/{smart_account}", asdict(config))
    return PolicyResponse(
        smart_account=data["smartAccount"],
        per_tx_cap_usdc_micro=data["perTxCapUsdcMicro"],
        daily_cap_usdc_micro=data["dailyCapUsdcMicro"],
        rolling_24h_spend_usdc_micro=data["rolling24hSpendUsdcMicro"],
        remaining_daily_usdc_micro=data["remainingDailyUsdcMicro"],
        updated_at=data["updatedAt"],
    )


def issue_session_key(
    client: AgentPayClient,
    request: IssueSessionKeyRequest,
) -> SessionKeyResponse:
    """Issue a new session key.

    POST /v1/policy/session-keys
    """
    body = {
        "keyId": request.key_id,
        "smartAccount": request.smart_account,
        "publicKey": request.public_key,
        "notBefore": request.not_before,
        "notAfter": request.not_after,
        "bounds": asdict(request.bounds),
    }
    data = client.post("/v1/policy/session-keys", body)
    return SessionKeyResponse(
        key_id=data["keyId"],
        smart_account=data["smartAccount"],
        public_key=data["publicKey"],
        not_before=data["notBefore"],
        not_after=data["notAfter"],
        bounds=data["bounds"],
        status=data["status"],
        issued_at=data["issuedAt"],
        revoked_at=data.get("revokedAt"),
    )


def revoke_session_key(client: AgentPayClient, key_id: str) -> None:
    """Revoke a session key.

    DELETE /v1/policy/session-keys/:keyId
    """
    client.delete(f"/v1/policy/session-keys/{key_id}")
