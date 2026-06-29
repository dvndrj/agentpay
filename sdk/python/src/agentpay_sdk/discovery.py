"""Discovery stub (mirrors sdk/typescript/src/discovery.ts).

MVP: always returns an empty list. Full semantic search arrives with
Discovery_Service (Task 13, post-MVP).
"""

from .client import AgentPayClient
from .types import AgentDiscoveryResult


def discover_agents(
    client: AgentPayClient,
    query: str | None = None,
    min_trust_score: int | None = None,
    limit: int | None = None,
) -> list[AgentDiscoveryResult]:
    """Discover agents (MVP stub — always returns [])."""
    return []
