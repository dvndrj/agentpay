import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { DatabaseModule } from "@agentpay/migrations/database.module";
import { RedisModule } from "@agentpay/redis";
import { KafkaModule } from "@agentpay/kafka";
import { ObservabilityModule } from "@agentpay/observability";
import { CanonicalJsonAdapter } from "@agentpay/canonical-json-adapter";
import { SettlementController } from "./settlement.controller";
import { SettlementService } from "./settlement.service";
import { EscrowClient } from "./chain/escrow-client";
import { ChainObserver } from "./chain/chain-observer";
import type { ChainConfig } from "./settlement.dto";

/**
 * Chain configuration factory.
 *
 * Reads from environment variables with sensible defaults for Base Sepolia.
 * In production, set these via the deployment environment.
 */
const chainConfigFactory = (config: ConfigService): ChainConfig => ({
  rpcUrl:
    config.get<string>("CHAIN_RPC_URL") ??
    "https://sepolia.base.org",
  escrowVaultAddress:
    config.get<string>("ESCROW_VAULT_ADDRESS") ??
    "0x0000000000000000000000000000000000000000", // Override in env!
  usdcAddress:
    config.get<string>("USDC_ADDRESS") ??
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
  chainId: config.get<number>("CHAIN_ID") ?? 84532, // Base Sepolia
});

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule.register({ timeout: 5000, maxRedirects: 0 }),
    DatabaseModule,
    RedisModule,
    KafkaModule,
    ObservabilityModule,
  ],
  controllers: [SettlementController],
  providers: [
    CanonicalJsonAdapter,
    SettlementService,
    // Chain providers
    {
      provide: "CHAIN_CONFIG",
      useFactory: chainConfigFactory,
      inject: [ConfigService],
    },
    EscrowClient,
    ChainObserver,
    // Service URLs (override via env in production)
    {
      provide: "POLICY_ENGINE_URL",
      useFactory: (config: ConfigService) =>
        config.get<string>("POLICY_ENGINE_URL") ?? "http://localhost:3001",
      inject: [ConfigService],
    },
    {
      provide: "RAILS_LEDGER_URL",
      useFactory: (config: ConfigService) =>
        config.get<string>("RAILS_LEDGER_URL") ?? "http://localhost:3002",
      inject: [ConfigService],
    },
  ],
})
export class SettlementModule {}
