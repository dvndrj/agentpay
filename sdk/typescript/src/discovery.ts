import type { AgentPayClient } from "./client";
import type { AgentDiscoveryResult } from "./types";

/**
 * Discover agents (MVP stub — R11.1).
 *
 * In MVP, discovery is not yet implemented. This function always returns an
 * empty array. The Discovery_Service (Task 13, post-MVP) will provide the
 * full semantic search capability.
 *
 * @returns An empty array in MVP
 */
export async function discoverAgents(
  _client: AgentPayClient,
  _query?: string,
  _minTrustScore?: number,
  _limit?: number,
): Promise<AgentDiscoveryResult[]> {
  return [];
}
