/**
 * AgentPay TypeScript SDK — main entry point (R11).
 *
 * Usage:
 * ```ts
 * import { AgentPay, parseX402Header } from "@agentpay/sdk";
 *
 * const agentpay = new AgentPay({ baseUrl: "https://api.agentpay.xyz" });
 *
 * // Register an agent
 * const { handle } = await agentpay.registerAgent(
 *   "0xSmartAccount...",
 *   { name: "My Agent", description: "Does things" },
 *   "0xPrivateKey..."
 * );
 *
 * // Pay an x402 charge
 * const receipt = await agentpay.pay(
 *   "amount=1000, asset=USDC, recipient=0x..., network=base-sepolia, nonce=...",
 *   "0xSmartAccount...",
 *   "sla-uuid...",
 *   { keyId: "key-uuid...", privateKey: "0x..." },
 *   "https://sepolia.base.org"
 * );
 * ```
 */

import { AgentPayClient } from "./client";
import { checkApiVersion } from "./version-check";
import { pay } from "./pay";
import { registerAgent } from "./register";
import { getObligation } from "./obligation";
import { setPolicy, issueSessionKey, revokeSessionKey } from "./policy";
import { discoverAgents } from "./discovery";
import { requestQuote } from "./negotiation";
import type { AgentPayConfig } from "./types";

// ── Public API ──────────────────────────────────────────────────

export { AgentPayApiError } from "./client";
export { AgentPaySdkError, parseX402Header } from "./x402";
export type * from "./types";

/**
 * AgentPay SDK client.
 *
 * Wraps the HTTP client with automatic API version checking on first call.
 * Provides all 8 SDK surface functions from Task 10.
 *
 * See individual function documentation for details.
 */
export class AgentPay {
  private readonly client: AgentPayClient;

  constructor(config: AgentPayConfig) {
    this.client = new AgentPayClient(config);
  }

  /**
   * Register a new agent with the Identity Registry (R1.1).
   *
   * Signs { smartAccount, metadataHash } via EIP-712 (noble-curves),
   * then POSTs to /v1/agents.
   *
   * @param smartAccount - Smart account address (0x...)
   * @param metadata - Agent metadata (name, description, etc.)
   * @param privateKey - Smart account private key for EIP-712 signing
   * @returns The handle and smart account
   */
  async registerAgent(
    smartAccount: `0x${string}`,
    metadata: import("./types").AgentMetadata,
    privateKey: `0x${string}`,
  ): Promise<import("./types").RegisterAgentResponse> {
    await checkApiVersion(this.client);
    return registerAgent(this.client, smartAccount, metadata, privateKey);
  }

  /**
   * Discover agents (MVP stub — always returns []).
   *
   * Full semantic search will be available post-MVP via Discovery_Service (Task 13).
   */
  async discoverAgents(
    query?: string,
    minTrustScore?: number,
    limit?: number,
  ): Promise<import("./types").AgentDiscoveryResult[]> {
    await checkApiVersion(this.client);
    return discoverAgents(this.client, query, minTrustScore, limit);
  }

  /**
   * Request a quote / SLA from a provider (MVP stub — returns fixed template).
   *
   * Full RFQ/quote/accept flow will be available post-MVP via Negotiation_Engine (Task 14).
   */
  async requestQuote(
    providerHandle: string,
  ): Promise<import("./types").SLA> {
    await checkApiVersion(this.client);
    return requestQuote(this.client, providerHandle);
  }

  /**
   * Pay an x402 charge using a session key (R4).
   *
   * Parses the x402 header, reads USDC balance/allowance via viem from Base L2,
   * signs the PaymentRequest with the session key (EIP-712, noble-curves),
   * and POSTs to /v1/settle.
   *
   * @param x402Header - Charge-Request header from HTTP 402 response
   * @param smartAccount - Consumer's smart account address
   * @param slaId - SLA being paid against (UUIDv7)
   * @param sessionKey - Session key for signing { keyId, privateKey }
   * @param rpcUrl - Base L2 RPC URL for chain reads
   * @returns The settlement receipt { txHash, obligationId, policyDecisionId }
   */
  async pay(
    x402Header: string,
    smartAccount: `0x${string}`,
    slaId: string,
    sessionKey: import("./types").SessionKey,
    rpcUrl: string,
  ): Promise<import("./types").SettleResponse> {
    await checkApiVersion(this.client);
    return pay(this.client, x402Header, smartAccount, slaId, sessionKey, rpcUrl);
  }

  /**
   * Get an obligation by ID (R9.1).
   *
   * GET /v1/rails/obligations/:id
   */
  async getObligation(
    obligationId: string,
  ): Promise<import("./types").ObligationResponse> {
    await checkApiVersion(this.client);
    return getObligation(this.client, obligationId);
  }

  /**
   * Set the spending policy for a smart account (R8.1).
   *
   * PUT /v1/policy/:smartAccount
   */
  async setPolicy(
    smartAccount: string,
    config: import("./types").PolicyConfig,
  ): Promise<import("./types").PolicyResponse> {
    await checkApiVersion(this.client);
    return setPolicy(this.client, smartAccount, config);
  }

  /**
   * Issue a new session key (R13.1).
   *
   * POST /v1/policy/session-keys
   */
  async issueSessionKey(
    request: import("./types").IssueSessionKeyRequest,
  ): Promise<import("./types").SessionKeyResponse> {
    await checkApiVersion(this.client);
    return issueSessionKey(this.client, request);
  }

  /**
   * Revoke a session key (R13.3).
   *
   * DELETE /v1/policy/session-keys/:keyId
   */
  async revokeSessionKey(keyId: string): Promise<void> {
    await checkApiVersion(this.client);
    return revokeSessionKey(this.client, keyId);
  }
}
