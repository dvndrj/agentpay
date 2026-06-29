import { Module } from "@nestjs/common";
import { DatabaseModule } from "@agentpay/migrations/database.module";
import { RedisModule } from "@agentpay/redis";
import { KafkaModule } from "@agentpay/kafka";
import { ObservabilityModule } from "@agentpay/observability";

@Module({
  imports: [DatabaseModule, RedisModule, KafkaModule, ObservabilityModule],
  controllers: [],
  providers: [],
})
export class ReputationModule {}
