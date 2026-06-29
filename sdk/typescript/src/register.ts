import { encode, hash } from "@agentpay/canonical-json";
import { signTypedData } from "./eip712";
import type { AgentPayClient } from "./client";
import type {
  AgentMetadata,
  RegisterAgentRequest,
  RegisterAgentResponse,
} from "./types";

/**
 * EIP-712 domain for agent registration signatures.
 */
const REGISTER_DOMAIN = {
  name: "AgentPay Identity",
  version: "1",
} as const;

const REGISTER_TYPES = {
  Register: [
    { name: "smartAccount", type: "address" },
    { name: "metadataHash", type: "bytes32" },
  ],
} as const;

/**
 * Register a new agent with the AgentPay Identity Registry (R1.1, R11.1).
 *
 * Flow:
 * 1. Canonical-encode the metadata and compute its SHA-256 hash
 * 2. Sign { smartAccount, metadataHash } with the smart account's key (EIP-712)
 * 3. POST to /v1/agents
 * 4. Return { handle, smartAccount }
 *
 * @param client - The AgentPay API client
 * @param smartAccount - The agent's smart account address
 * @param metadata - Agent metadata (name, description, etc.)
 * @param privateKey - The smart account's private key for EIP-712 signing
 * @returns The registered handle and smart account
 */
export async function registerAgent(
  client: AgentPayClient,
  smartAccount: `0x${string}`,
  metadata: AgentMetadata,
  privateKey: `0x${string}`,
): Promise<RegisterAgentResponse> {
  // ── 1. Compute metadata hash ──────────────────────────────────
  const canonicalBytes = encode(metadata);
  const metadataHash = hash(metadata);

  // ── 2. Sign { smartAccount, metadataHash } ────────────────────
  const signature = signTypedData(privateKey, {
    domain: REGISTER_DOMAIN,
    types: REGISTER_TYPES,
    primaryType: "Register",
    message: {
      smartAccount,
      metadataHash: bytesToHex(metadataHash),
    },
  });

  // ── 3. POST /v1/agents ───────────────────────────────────────
  const body: RegisterAgentRequest = {
    smartAccount,
    signature,
    metadata,
    metadataHash: bytesToHex(metadataHash),
  };

  return client.post<RegisterAgentResponse>("/v1/agents", body);
}

/**
 * Convert a Uint8Array to a 0x-prefixed hex string.
 */
function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
