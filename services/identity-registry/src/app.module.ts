import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DatabaseModule } from "@agentpay/migrations/database.module";
import { RedisModule } from "@agentpay/redis";
import { KafkaModule } from "@agentpay/kafka";
import { ObservabilityModule } from "@agentpay/observability";
import { CanonicalJsonAdapter } from "@agentpay/canonical-json-adapter";
import { IdentityRegistryController } from "./identity-registry.controller";
import { IdentityRegistryService } from "./identity-registry.service";
import { IdentityRegistryClient } from "./chain/identity-registry-client";
import type { ChainConfig } from "./identity-registry.dto";

const chainConfigFactory = (config: ConfigService): ChainConfig => ({
  rpcUrl:
    config.get<string>("CHAIN_RPC_URL") ??
    "https://sepolia.base.org",
  identityRegistryAddress:
    config.get<string>("IDENTITY_REGISTRY_ADDRESS") ??
    "0x0000000000000000000000000000000000000000",
  chainId: config.get<number>("CHAIN_ID") ?? 84532,
});

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    RedisModule,
    KafkaModule,
    ObservabilityModule,
  ],
  controllers: [IdentityRegistryController],
  providers: [
    CanonicalJsonAdapter,
    IdentityRegistryService,
    {
      provide: "CHAIN_CONFIG",
      useFactory: chainConfigFactory,
      inject: [ConfigService],
    },
    IdentityRegistryClient,
  ],
})
export class IdentityRegistryModule {}
