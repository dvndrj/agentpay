import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { NegotiationService } from "./negotiation.service";
import {
  CreateRfqDto,
  SubmitQuoteDto,
  AcceptRfqDto,
} from "./negotiation.dto";

/**
 * Negotiation Engine Controller (R3).
 *
 * Endpoints:
 *   POST /v1/rfq                — Create RFQ
 *   GET  /v1/rfq/:id            — Get RFQ status
 *   POST /v1/rfq/:id/quote      — Provider submits quote
 *   POST /v1/rfq/:id/accept     — Consumer accepts, SLA signed
 *   GET  /v1/sla/:slaId         — Retrieve signed SLA
 */
@Controller("v1")
export class NegotiationController {
  constructor(private readonly negotiation: NegotiationService) {}

  /**
   * POST /v1/rfq
   *
   * Create a new RFQ (Request for Quote).
   *
   * Body: { rfqId, consumerHandle, providerHandle, task, deadlineMs }
   * Returns: RFQ with status OPEN
   */
  @Post("rfq")
  @HttpCode(HttpStatus.CREATED)
  async createRfq(@Body() dto: CreateRfqDto) {
    return this.negotiation.createRfq(dto);
  }

  /**
   * GET /v1/rfq/:id
   *
   * Get RFQ status and details.
   */
  @Get("rfq/:id")
  async getRfq(@Param("id") id: string) {
    return this.negotiation.getRfq(id);
  }

  /**
   * POST /v1/rfq/:id/quote
   *
   * Provider submits a quote against an OPEN RFQ.
   * Body: { providerHandle, priceUsdcMicro, latencyBoundMs, successCriteria, providerSignature }
   */
  @Post("rfq/:id/quote")
  async submitQuote(
    @Param("id") id: string,
    @Body() dto: SubmitQuoteDto,
  ) {
    return this.negotiation.submitQuote(id, dto);
  }

  /**
   * POST /v1/rfq/:id/accept
   *
   * Consumer accepts a QUOTED RFQ, completing the SLA.
   * Body: { consumerHandle, consumerSignature }
   * Returns: Full signed SLA
   */
  @Post("rfq/:id/accept")
  async acceptRfq(
    @Param("id") id: string,
    @Body() dto: AcceptRfqDto,
  ) {
    return this.negotiation.acceptRfq(id, dto);
  }

  /**
   * GET /v1/sla/:slaId
   *
   * Retrieve a signed SLA by ID.
   */
  @Get("sla/:slaId")
  async getSla(@Param("slaId") slaId: string) {
    return this.negotiation.getSla(slaId);
  }
}
