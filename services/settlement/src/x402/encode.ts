import type { ChargeRequest } from "./types";

/**
 * Encode a ChargeRequest into an x402 header string.
 *
 * Output format (R4.1):
 *   `amount=<uint256>, asset=USDC, recipient=<0xaddress>, network=<network>, nonce=<uuidv7>`
 *
 * Fields are always emitted in alphabetical order for deterministic output.
 *
 * @param charge - The charge request to encode
 * @returns The x402 header string
 */
export function encodeX402(charge: ChargeRequest): string {
  return [
    `amount=${charge.amount}`,
    `asset=${charge.asset}`,
    `network=${charge.network}`,
    `nonce=${charge.nonce}`,
    `recipient=${charge.recipient}`,
  ].join(", ");
}
