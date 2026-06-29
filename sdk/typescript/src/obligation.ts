import type { AgentPayClient } from "./client";
import type { ObligationResponse, SettleResponse } from "./types";

/**
 * Get an obligation by ID (R11.1).
 *
 * GET /v1/rails/obligations/:id
 *
 * @param client - The AgentPay API client
 * @param obligationId - UUIDv7 obligation identifier
 * @returns The full obligation record
 */
export async function getObligation(
  client: AgentPayClient,
  obligationId: string,
): Promise<ObligationResponse> {
  return client.get<ObligationResponse>(`/v1/rails/obligations/${obligationId}`);
}
