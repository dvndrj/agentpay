import { v7 as uuidv7 } from "uuid";
import { createPublicClient, http, erc20Abi } from "viem";
import { base, baseSepolia } from "viem/chains";
import { encode } from "@agentpay/canonical-json";
import { parseX402Header, AgentPaySdkError } from "./x402";
import { signTypedData } from "./eip712";
import type { AgentPayClient } from "./client";
import type {
  ChargeRequest,
  SessionKey,
  SettleResponse,
} from "./types";

/**
 * EIP-712 domain for AgentPay PaymentRequest signing.
 *
 * The verifyingContract is the Settlement Service endpoint, not a contract
 * address — the signature is verified off-chain by Policy_Engine.
 */
const PAYMENT_REQUEST_DOMAIN = {
  name: "AgentPay Payment",
  version: "1",
} as const;

const PAYMENT_REQUEST_TYPES = {
  PaymentRequest: [
    { name: "smartAccount", type: "address" },
    { name: "slaId", type: "bytes32" },
    { name: "amountUsdcMicro", type: "uint256" },
    { name: "asset", type: "string" },
    { name: "network", type: "string" },
    { name: "recipient", type: "address" },
    { name: "nonce", type: "string" },
    { name: "sessionKeyId", type: "bytes32" },
    { name: "requestId", type: "bytes32" },
    { name: "submittedAt", type: "string" },
  ],
} as const;

/**
 * Pay an x402 charge using a session key (R4, R11.2).
 *
 * Full flow:
 * 1. Parse the x402 charge header from the HTTP 402 response
 * 2. Read USDC balance and allowance via viem from Base L2
 * 3. Construct a PaymentRequest with canonical JSON
 * 4. Sign the PaymentRequest with the session key (EIP-712, noble-curves)
 * 5. POST the signed request to /v1/settle
 * 6. Return the x402 receipt { txHash, obligationId, policyDecisionId }
 *
 * @param client - The AgentPay API client
 * @param x402Header - The Charge-Request header value from the HTTP 402 response
 * @param smartAccount - The consumer's smart account address
 * @param slaId - The SLA identifier being paid against
 * @param sessionKey - The session key for signing (contains keyId + privateKey)
 * @param rpcUrl - Base L2 RPC URL for chain reads
 * @returns The settlement receipt
 */
export async function pay(
  client: AgentPayClient,
  x402Header: string,
  smartAccount: `0x${string}`,
  slaId: string,
  sessionKey: SessionKey,
  rpcUrl: string,
): Promise<SettleResponse> {
  // ── 1. Parse the x402 charge header ───────────────────────────
  const charge = parseX402Header(x402Header);

  // ── 2. Read USDC balance and allowance (R11.1) ────────────────
  await checkUsdcBalance(charge, smartAccount, rpcUrl);

  // ── 3. Construct PaymentRequest ───────────────────────────────
  const requestId = uuidv7();
  const submittedAt = new Date().toISOString();

  const paymentRequest = {
    smartAccount,
    slaId,
    amountUsdcMicro: charge.amount,
    asset: charge.asset,
    network: charge.network,
    recipient: charge.recipient,
    nonce: charge.nonce,
    sessionKeyId: sessionKey.keyId,
    requestId,
    submittedAt,
  };

  // ── 4. Sign with session key (EIP-712, noble-curves) ──────────
  const sessionKeySignature = signTypedData(sessionKey.privateKey, {
    domain: PAYMENT_REQUEST_DOMAIN,
    types: PAYMENT_REQUEST_TYPES,
    primaryType: "PaymentRequest",
    message: {
      smartAccount: paymentRequest.smartAccount,
      slaId: uuidToBytes32(paymentRequest.slaId),
      amountUsdcMicro: BigInt(paymentRequest.amountUsdcMicro),
      asset: paymentRequest.asset,
      network: paymentRequest.network,
      recipient: paymentRequest.recipient,
      nonce: paymentRequest.nonce,
      sessionKeyId: uuidToBytes32(paymentRequest.sessionKeyId),
      requestId: uuidToBytes32(paymentRequest.requestId),
      submittedAt: paymentRequest.submittedAt,
    },
  });

  // ── 5. Build settle request body ─────────────────────────────
  const settleRequest = {
    charge: {
      amount: charge.amount,
      asset: charge.asset,
      recipient: charge.recipient,
      network: charge.network,
      nonce: charge.nonce,
    },
    smartAccount,
    slaId,
    sessionKeyId: sessionKey.keyId,
    sessionKeySignature,
    schemaVersion: 1,
  };

  // ── 6. POST /v1/settle ────────────────────────────────────────
  return client.post<SettleResponse>("/v1/settle", settleRequest);
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Check that the smart account has sufficient USDC balance and has
 * approved the EscrowVault for at least the charge amount.
 *
 * This is a best-effort pre-flight check. The Policy_Engine performs
 * the authoritative balance check atomically during evaluation.
 */
async function checkUsdcBalance(
  charge: ChargeRequest,
  smartAccount: `0x${string}`,
  rpcUrl: string,
): Promise<void> {
  const chainId = charge.network === "base-mainnet" ? base.id : baseSepolia.id;
  const chain = chainId === base.id ? base : baseSepolia;

  let publicClient;
  try {
    publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
  } catch {
    // Chain RPC unreachable — skip pre-flight, let Policy_Engine catch it
    return;
  }

  // Read USDC balance
  const usdcAddress = chainId === base.id
    ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" // Base mainnet USDC
    : "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC

  try {
    const balance = await publicClient.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [smartAccount],
    });

    if (balance < BigInt(charge.amount)) {
      throw new AgentPaySdkError(
        "insufficient_balance",
        `USDC balance ${balance} is less than charge amount ${charge.amount}`,
      );
    }
  } catch (err) {
    if (err instanceof AgentPaySdkError) throw err;
    // Chain read failed — skip pre-flight, let settle handle it
  }
}

/**
 * Convert a UUIDv7 string to a bytes32 hex value.
 */
function uuidToBytes32(uuid: string): `0x${string}` {
  const hex = uuid.replace(/-/g, "");
  return `0x${hex.padEnd(64, "0")}`;
}
