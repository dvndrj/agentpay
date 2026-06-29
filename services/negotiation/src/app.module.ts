import { Module } from "@nestjs/common";
import { DatabaseModule } from "@agentpay/migrations/database.module";
import { RedisModule } from "@agentpay/redis";
import { KafkaModule } from "@agentpay/kafka";
import { ObservabilityModule } from "@agentpay/observability";
import { CanonicalJsonAdapter } from "@agentpay/canonical-json-adapter";
import { NegotiationController } from "./negotiation.controller";
import { NegotiationService } from "./negotiation.service";

@Module({
  imports: [DatabaseModule, RedisModule, KafkaModule, ObservabilityModule],
  controllers: [NegotiationController],
  providers: [CanonicalJsonAdapter, NegotiationService],
})
export class NegotiationModule {}
