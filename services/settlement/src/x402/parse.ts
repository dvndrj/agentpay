import type { ChargeRequest } from "./types";
import { ErrorCode } from "@agentpay/error-envelope";

/**
 * Parsed x402 header fields before validation.
 */
interface RawChargeFields {
  amount?: string;
  asset?: string;
  recipient?: string;
  network?: string;
  nonce?: string;
}

/** Field names required in every x402 charge header. */
const REQUIRED_FIELDS = ["amount", "asset", "recipient", "network", "nonce"] as const;

/** Valid network values. */
const VALID_NETWORKS = new Set(["base-mainnet", "base-sepolia"]);

/**
 * Parse an x402 charge header string into a typed ChargeRequest.
 *
 * The header format is comma-separated key=value pairs:
 *   `amount=1000, asset=USDC, recipient=0x..., network=base-sepolia, nonce=uuidv7`
 *
 * Validation rules (R4.1):
 * - All five fields are required
 * - `asset` must be "USDC"
 * - `network` must be "base-mainnet" or "base-sepolia"
 * - `amount` must be a positive decimal string
 * - `recipient` must be a valid 0x-prefixed hexadecimal address
 * - `nonce` must be a non-empty string (UUIDv7)
 *
 * @throws {ErrorEnvelopeException} with code X402_PARSE_ERROR on malformed headers
 */
export function parseX402(header: string): ChargeRequest {
  if (!header || header.trim().length === 0) {
    throwX402Error("Empty charge header");
  }

  const raw = parseKeyValuePairs(header.trim());

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!raw[field]) {
      throwX402Error(`Missing required field: ${field}`);
    }
  }

  // Validate asset
  if (raw.asset !== "USDC") {
    throwX402Error(`Unsupported asset: ${raw.asset} (only USDC is supported)`);
  }

  // Validate network
  if (!VALID_NETWORKS.has(raw.network!)) {
    throwX402Error(
      `Unsupported network: ${raw.network} (must be base-mainnet or base-sepolia)`,
    );
  }

  // Validate amount
  if (!/^\d+$/.test(raw.amount!)) {
    throwX402Error(`Invalid amount: ${raw.amount} (must be a positive integer in micro-units)`);
  }
  if (BigInt(raw.amount!) <= 0n) {
    throwX402Error(`Amount must be positive, got: ${raw.amount}`);
  }

  // Validate recipient (basic 0x-address format)
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw.recipient!)) {
    throwX402Error(`Invalid recipient address: ${raw.recipient}`);
  }

  // nonce is any non-empty string — UUIDv7 format is recommended but
  // we only enforce non-empty to stay compatible with future formats.

  return {
    amount: raw.amount!,
    asset: raw.asset as "USDC",
    recipient: raw.recipient!,
    network: raw.network as "base-mainnet" | "base-sepolia",
    nonce: raw.nonce!,
  };
}

/**
 * Parse a comma-separated key=value header string into a raw field map.
 *
 * Handles:
 * - Leading/trailing whitespace around keys and values
 * - Values containing `=` (everything after the first `=` is the value)
 * - Empty values
 */
function parseKeyValuePairs(header: string): RawChargeFields {
  const fields: RawChargeFields = {};

  for (const pair of header.split(",")) {
    const trimmed = pair.trim();
    if (trimmed.length === 0) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      throwX402Error(`Malformed key=value pair: "${trimmed}"`);
    }

    const key = trimmed.slice(0, eqIndex).trim().toLowerCase();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (key in fields) {
      throwX402Error(`Duplicate field: ${key}`);
    }

    (fields as Record<string, string>)[key] = value;
  }

  return fields;
}

/**
 * Throw a structured x402 parse error.
 */
function throwX402Error(message: string): never {
  const { ErrorEnvelopeException, createError } = require("@agentpay/error-envelope");
  throw new ErrorEnvelopeException(
    createError(ErrorCode.X402_PARSE_ERROR, message, { field: "Charge-Request" }),
  );
}
