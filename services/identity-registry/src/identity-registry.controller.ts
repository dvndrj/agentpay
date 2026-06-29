import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { IdentityRegistryService } from "./identity-registry.service";
import { RegisterAgentDto } from "./identity-registry.dto";

/**
 * Identity Registry Controller.
 *
 * Endpoints (R1):
 *   POST   /v1/agents                  — Register a new agent
 *   GET    /v1/agents/:handle           — Lookup by handle
 *   GET    /v1/agents/by-account/:addr  — Lookup by smart account
 */
@Controller("v1/agents")
export class IdentityRegistryController {
  constructor(private readonly service: IdentityRegistryService) {}

  /**
   * POST /v1/agents
   *
   * Register a new agent with the IdentityRegistry (R1.1, R1.3, R1.4).
   *
   * Body: {
   *   smartAccount: "0x...",
   *   signature: "0x...",        // EIP-712 signature over {smartAccount, metadataHash}
   *   metadata: { name, description, ... },
   *   metadataHash?: "0x..."     // auto-computed from metadata if omitted
   * }
   *
   * Returns: { handle: "123", smartAccount: "0x..." }
   *
   * Idempotent: re-submitting with the same smartAccount returns the
   * existing handle.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterAgentDto) {
    return this.service.registerAgent(dto);
  }

  /**
   * GET /v1/agents/:handle
   *
   * Retrieve agent info by handle (R1.3).
   */
  @Get(":handle")
  async getByHandle(@Param("handle") handle: string) {
    return this.service.getAgentByHandle(handle);
  }

  /**
   * GET /v1/agents/by-account/:addr
   *
   * Retrieve agent info by smart account address (R1.3).
   */
  @Get("by-account/:addr")
  async getByAccount(@Param("addr") addr: string) {
    return this.service.getAgentByAccount(addr);
  }
}
