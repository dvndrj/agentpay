import { Module } from "@nestjs/common";
import { DatabaseModule } from "@agentpay/migrations/database.module";
import { RedisModule } from "@agentpay/redis";
import { KafkaModule } from "@agentpay/kafka";
import { ObservabilityModule } from "@agentpay/observability";
import { CanonicalJsonAdapter } from "@agentpay/canonical-json-adapter";
import { DiscoveryController } from "./discovery.controller";
import { DiscoveryService } from "./discovery.service";
import { FakeEmbeddingClient } from "./embeddings/embedding-client";
import type { EmbeddingClient } from "./embeddings/embedding-client";

@Module({
  imports: [DatabaseModule, RedisModule, KafkaModule, ObservabilityModule],
  controllers: [DiscoveryController],
  providers: [
    CanonicalJsonAdapter,
    DiscoveryService,
    {
      provide: "EMBEDDING_CLIENT",
      // In production, swap this for SentenceTransformersClient /
      // OpenAIEmbeddingClient / VoyageEmbeddingClient (ADR-1, Task 20.1).
      useClass: FakeEmbeddingClient,
    },
  ],
})
export class DiscoveryModule {}
