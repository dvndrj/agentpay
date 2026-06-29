import type { AgentPayClient } from "./client";
import type {
  PolicyConfig,
  PolicyResponse,
  IssueSessionKeyRequest,
  SessionKeyResponse,
} from "./types";

/**
 * Set the spending policy for a smart account (R8.1, R11.1).
 *
 * PUT /v1/policy/:smartAccount
 *
 * @param client - The AgentPay API client
 * @param smartAccount - The smart account address
 * @param config - Per-transaction and daily spending caps
 * @returns The updated policy
 */
export async function setPolicy(
  client: AgentPayClient,
  smartAccount: string,
  config: PolicyConfig,
): Promise<PolicyResponse> {
  return client.put<PolicyResponse>(`/v1/policy/${smartAccount}`, config);
}

/**
 * Issue a new session key (R13.1, R11.1).
 *
 * POST /v1/policy/session-keys
 *
 * @param client - The AgentPay API client
 * @param request - Session key details including keyId, publicKey, window, bounds
 * @returns The created session key
 */
export async function issueSessionKey(
  client: AgentPayClient,
  request: IssueSessionKeyRequest,
): Promise<SessionKeyResponse> {
  return client.post<SessionKeyResponse>("/v1/policy/session-keys", request);
}

/**
 * Revoke a session key (R13.3, R11.1).
 *
 * DELETE /v1/policy/session-keys/:keyId
 *
 * @param client - The AgentPay API client
 * @param keyId - UUIDv7 identifier of the session key to revoke
 */
export async function revokeSessionKey(
  client: AgentPayClient,
  keyId: string,
): Promise<void> {
  await client.delete(`/v1/policy/session-keys/${keyId}`);
}
