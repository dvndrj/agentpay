import type { ChargeRequest } from "./types";

/**
 * Parse an x402 charge header string into a typed ChargeRequest.
 *
 * The x402 header format is comma-separated key=value pairs:
 *   `amount=1000, asset=USDC, recipient=0x..., network=base-sepolia, nonce=uuidv7`
 *
 * This is a vendor copy of the parser from services/settlement/src/x402/parse.ts
 * to keep the SDK dependency-free from NestJS services.
 */
export function parseX402Header(header: string): ChargeRequest {
  if (!header || header.trim().length === 0) {
    throw new AgentPaySdkError("x402_parse_error", "Empty charge header");
  }

  const fields: Record<string, string> = {};

  for (const pair of header.trim().split(",")) {
    const trimmed = pair.trim();
    if (trimmed.length === 0) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      throw new AgentPaySdkError("x402_parse_error", `Malformed key=value pair: "${trimmed}"`);
    }

    const key = trimmed.slice(0, eqIndex).trim().toLowerCase();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (key in fields) {
      throw new AgentPaySdkError("x402_parse_error", `Duplicate field: ${key}`);
    }

    fields[key] = value;
  }

  // Validate required fields
  for (const field of ["amount", "asset", "recipient", "network", "nonce"]) {
    if (!fields[field]) {
      throw new AgentPaySdkError("x402_parse_error", `Missing required field: ${field}`);
    }
  }

  if (fields.asset !== "USDC") {
    throw new AgentPaySdkError("x402_parse_error", `Unsupported asset: ${fields.asset}`);
  }

  if (!["base-mainnet", "base-sepolia"].includes(fields.network!)) {
    throw new AgentPaySdkError("x402_parse_error", `Unsupported network: ${fields.network}`);
  }

  if (!/^\d+$/.test(fields.amount!)) {
    throw new AgentPaySdkError("x402_parse_error", `Invalid amount: ${fields.amount}`);
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(fields.recipient!)) {
    throw new AgentPaySdkError("x402_parse_error", `Invalid recipient: ${fields.recipient}`);
  }

  return {
    amount: fields.amount!,
    asset: "USDC",
    recipient: fields.recipient as `0x${string}`,
    network: fields.network as "base-mainnet" | "base-sepolia",
    nonce: fields.nonce!,
  };
}

/**
 * SDK-specific error class.
 */
export class AgentPaySdkError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentPaySdkError";
  }
}
