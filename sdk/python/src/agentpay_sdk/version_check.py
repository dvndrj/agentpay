"""API version check (mirrors sdk/typescript/src/version_check.ts)."""

import warnings
from .client import AgentPayClient

_SUPPORTED_VERSION_RANGE = "^0"
_version_checked = False


def check_api_version(client: AgentPayClient) -> None:
    """Check the AgentPay API version on the first SDK call.

    Fetches GET /v1/meta/version. If the major version differs from the
    supported range, emits a single ``warnings.warn``.
    """
    global _version_checked
    if _version_checked:
        return
    _version_checked = True

    try:
        data = client.get("/v1/meta/version")
        version = data.get("version", "0.0.0")
        major = int(version.split(".")[0])
        supported_major = int(_SUPPORTED_VERSION_RANGE.lstrip("^"))

        if major != supported_major:
            warnings.warn(
                f"[AgentPay SDK] API version {version} is outside the supported "
                f"range {_SUPPORTED_VERSION_RANGE}.x. Some features may not work "
                f"correctly. Please update agentpay-sdk to match the server version."
            )
    except Exception:
        # Version endpoint is optional — fail silently
        pass
