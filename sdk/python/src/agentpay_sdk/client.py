"""HTTP client wrapper for the AgentPay SDK (mirrors sdk/typescript/src/client.ts)."""

import json
from typing import Optional, Any

import requests

from .types import AgentPayConfig, AgentPayError


class AgentPayApiError(Exception):
    """Structured AgentPay API error."""

    def __init__(
        self,
        code: str,
        message: str,
        http_status: int,
        details: Optional[dict] = None,
        request_id: Optional[str] = None,
        policy_decision_id: Optional[str] = None,
    ):
        self.code = code
        self.http_status = http_status
        self.details = details
        self.request_id = request_id
        self.policy_decision_id = policy_decision_id
        super().__init__(message)


class AgentPayClient:
    """HTTP client for the AgentPay API."""

    def __init__(self, config: AgentPayConfig):
        self._base_url = config.base_url.rstrip("/")
        self._api_key = config.api_key
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )
        if self._api_key:
            self._session.headers["Authorization"] = f"Bearer {self._api_key}"

    def get(self, path: str) -> Any:
        """Make a GET request."""
        return self._request("GET", path)

    def post(self, path: str, body: Any = None) -> Any:
        """Make a POST request."""
        return self._request("POST", path, body)

    def put(self, path: str, body: Any = None) -> Any:
        """Make a PUT request."""
        return self._request("PUT", path, body)

    def delete(self, path: str) -> None:
        """Make a DELETE request."""
        self._request("DELETE", path)

    def _request(
        self,
        method: str,
        path: str,
        body: Any = None,
    ) -> Any:
        url = f"{self._base_url}{path}"
        data = json.dumps(body) if body is not None else None

        response = self._session.request(method, url, data=data)

        if not response.ok:
            content_type = response.headers.get("content-type", "")
            if "application/json" in content_type:
                try:
                    err = response.json()
                    raise AgentPayApiError(
                        code=err.get("code", "unknown_error"),
                        message=err.get("message", f"HTTP {response.status_code}"),
                        http_status=response.status_code,
                        details=err.get("details"),
                        request_id=err.get("request_id"),
                        policy_decision_id=err.get("policy_decision_id"),
                    )
                except (ValueError, KeyError):
                    pass
            raise AgentPayApiError(
                code="http_error",
                message=f"HTTP {response.status_code}: {response.reason}",
                http_status=response.status_code,
            )

        if response.status_code == 204:
            return None

        return response.json()
