import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
} from "@nestjs/common";
import { SettlementService } from "./settlement.service";
import { SettleRequestDto } from "./settlement.dto";

/**
 * Settlement Controller — POST /v1/settle
 *
 * Processes x402 payment settlement requests (R4).
 *
 * Headers:
 *   X-Request-ID: UUIDv7 for idempotency and tracing
 *   Idempotency-Key: optional, for write idempotency
 *
 * Body: SettleRequestDto {
 *   charge: { amount, asset, recipient, network, nonce },
 *   smartAccount, slaId, sessionKeyId, sessionKeySignature
 * }
 *
 * Response (200): SettleResponse { txHash, obligationId, policyDecisionId }
 *
 * Error responses:
 *   400 — invalid_request, x402_parse_error
 *   402 — unsupported_asset, unsupported_network
 *   403 — policy_denied
 *   502 — policy_unavailable, chain_revert, chain_timeout
 */
@Controller("v1")
export class SettlementController {
  constructor(private readonly settlement: SettlementService) {}

  @Post("settle")
  @HttpCode(HttpStatus.OK)
  async settle(
    @Body() dto: SettleRequestDto,
    @Headers("x-request-id") requestIdHeader?: string,
  ): Promise<{ txHash: string; obligationId: string; policyDecisionId: string }> {
    const requestId = requestIdHeader ?? crypto.randomUUID();
    return this.settlement.settle(dto, requestId);
  }
}
