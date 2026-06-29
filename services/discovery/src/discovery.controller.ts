import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { DiscoveryService } from "./discovery.service";
import type {
  RegisterProviderDto,
  RegisterProviderResponse,
  SearchQueryDto,
  SearchResult,
  DeregisterResponse,
} from "./discovery.dto";

/**
 * Discovery Controller (R2).
 *
 * Endpoints:
 *   POST   /v1/discovery/providers            — Register/update provider
 *   GET    /v1/discovery/search?q&min_trust_score&limit — Semantic search
 *   DELETE /v1/discovery/providers/:handle     — Deregister provider
 */
@Controller("v1/discovery")
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  /**
   * POST /v1/discovery/providers
   *
   * Register or update a provider's OpenAPI 3.1 spec in the discovery index.
   *
   * Body: { handle: string, spec: OpenAPI31Document }
   * Returns: { handle, trustScore, indexedAt }
   *
   * Validation errors are returned as a list of per-violation messages.
   */
  @Post("providers")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterProviderDto): Promise<RegisterProviderResponse> {
    return this.discovery.registerProvider(dto);
  }

  /**
   * GET /v1/discovery/search
   *
   * Semantic search for providers. Embeds the query string,
   * performs pgvector cosine similarity search, and filters
   * by minimum trust score.
   *
   * Query params:
   *   q               — Natural-language query (required)
   *   min_trust_score — Minimum trust score (default: 0)
   *   limit           — Max results (default: 20, max: 50)
   *
   * Returns up to 50 handles ordered by cosine similarity descending.
   */
  @Get("search")
  async search(
    @Query("q") q: string,
    @Query("min_trust_score") minTrustScore?: string,
    @Query("limit") limit?: string,
  ): Promise<SearchResult[]> {
    const query: SearchQueryDto = {
      q,
      min_trust_score: minTrustScore ? parseInt(minTrustScore, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };
    return this.discovery.search(query);
  }

  /**
   * DELETE /v1/discovery/providers/:handle
   *
   * Deregister a provider. The handle is excluded from search results
   * within 60 seconds (R2.5).
   */
  @Delete("providers/:handle")
  async deregister(
    @Param("handle") handle: string,
  ): Promise<DeregisterResponse> {
    return this.discovery.deregisterProvider(handle);
  }
}
