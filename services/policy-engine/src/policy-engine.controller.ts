import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { PolicyEngineService } from "./policy-engine.service";
import {
  PaymentRequestDto,
  UpdatePolicyDto,
  IssueSessionKeyDto,
} from "./policy.dto";

@Controller("v1/policy")
export class PolicyEngineController {
  constructor(private readonly policyEngine: PolicyEngineService) {}

  /**
   * POST /v1/policy/evaluate
   *
   * Evaluate a payment request through the atomic four-check gate (R7).
   * Body: PaymentRequest (canonical JSON form)
   * Returns: PolicyDecision { verdict, policyDecisionId, reasonCode, ... }
   */
  @Post("evaluate")
  async evaluate(@Body() dto: PaymentRequestDto) {
    return this.policyEngine.evaluate(dto);
  }

  /**
   * GET /v1/policy/:smartAccount
   *
   * Get the current policy for a Smart Account (R8.4).
   */
  @Get(":smartAccount")
  async getPolicy(@Param("smartAccount") smartAccount: string) {
    return this.policyEngine.getPolicy(smartAccount);
  }

  /**
   * PUT /v1/policy/:smartAccount
   *
   * Update the spending policy for a Smart Account (R8.1, R8.3).
   * Body: { perTxCapUsdcMicro, dailyCapUsdcMicro }
   */
  @Put(":smartAccount")
  async updatePolicy(
    @Param("smartAccount") smartAccount: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    const operator = smartAccount; // In MVP, the operator is the account owner
    return this.policyEngine.updatePolicy(smartAccount, dto, operator);
  }

  /**
   * POST /v1/policy/session-keys
   *
   * Issue a new session key with validity window and spending bounds (R13.1).
   */
  @Post("session-keys")
  @HttpCode(HttpStatus.CREATED)
  async issueSessionKey(@Body() dto: IssueSessionKeyDto) {
    return this.policyEngine.issueSessionKey(dto);
  }

  /**
   * DELETE /v1/policy/session-keys/:keyId
   *
   * Revoke a session key (R13.3). Propagates via Redis pub/sub.
   */
  @Delete("session-keys/:keyId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSessionKey(@Param("keyId") keyId: string) {
    await this.policyEngine.revokeSessionKey(keyId);
  }
}
