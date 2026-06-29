import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { RailsLedgerService } from "./rails-ledger.service";
import { CreateObligationDto, MarkProvisionalDto, SubmitVerdictDto } from "./rails-ledger.dto";

@Controller("v1/rails")
export class RailsLedgerController {
  constructor(private readonly railsLedger: RailsLedgerService) {}

  /**
   * POST /v1/rails/obligations
   *
   * Create an obligation in DRAFT state (R9.1).
   * Idempotent: replay returns the existing obligation.
   */
  @Post("obligations")
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateObligationDto) {
    return this.railsLedger.createObligation(dto);
  }

  /**
   * GET /v1/rails/obligations/:id
   *
   * Retrieve an obligation by ID.
   */
  @Get("obligations/:id")
  async get(@Param("id") id: string) {
    return this.railsLedger.getObligation(id);
  }

  /**
   * POST /v1/rails/obligations/:id/provisional
   *
   * Transition DRAFT → PROVISIONAL with on-chain tx hash (R9.2).
   */
  @Post("obligations/:id/provisional")
  async markProvisional(@Param("id") id: string, @Body() dto: MarkProvisionalDto) {
    return this.railsLedger.markProvisional(id, dto);
  }

  /**
   * POST /v1/rails/obligations/:id/verdict
   *
   * Submit a performance verdict: PASS → FINAL, FAIL → REVERSED (R9.3, R9.4).
   */
  @Post("obligations/:id/verdict")
  async submitVerdict(@Param("id") id: string, @Body() dto: SubmitVerdictDto) {
    return this.railsLedger.submitVerdict(id, dto);
  }
}
