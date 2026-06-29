/**
 * x402 Charge Request types for the Settlement Service.
 *
 * x402 is an HTTP 402 Payment Required header format used by AgentPay
 * to communicate charge details between provider and consumer.
 *
 * Header format (R4.1):
 *   amount=<uint256_micro>, asset=USDC, recipient=<0xaddress>,
 *   network=base-sepolia|base-mainnet, nonce=<uuidv7>
 */

export interface ChargeRequest {
  /** Amount in USDC micro-units (1 USDC = 1_000_000 micro) */
  amount: string;
  /** Asset identifier — only "USDC" is supported in MVP */
  asset: "USDC";
  /** Recipient address on the settlement network (provider address) */
  recipient: string;
  /** Settlement network identifier */
  network: "base-mainnet" | "base-sepolia";
  /** Unique nonce for idempotency (UUIDv7) */
  nonce: string;
}
