import { v7 as uuidv7 } from "uuid";
import type { AgentPayClient } from "./client";
import type { SLA } from "./types";

/**
 * Request a quote / SLA from a provider (MVP stub — R11.1).
 *
 * In MVP, the Negotiation_Engine is not yet implemented. This function
 * returns a fixed-template SLA with a 24-hour expiry. The Negotiation_Engine
 * (Task 14, post-MVP) will provide the full RFQ/quote/accept flow.
 *
 * @param client - The AgentPay API client
 * @param _providerHandle - Handle of the provider to request a quote from
 * @returns A stub SLA with a 24-hour expiry
 */
export async function requestQuote(
  client: AgentPayClient,
  _providerHandle: string,
): Promise<SLA> {
  return {
    slaId: uuidv7(),
    consumerHandle: "stub-consumer",
    providerHandle: _providerHandle,
    terms: {
      priceUsdcMicro: "0",
      description: "MVP stub — Negotiation_Engine not yet implemented",
    },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}
