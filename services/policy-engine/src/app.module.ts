import { Module, ValidationPipe, MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { APP_PIPE, APP_INTERCEPTOR } from "@nestjs/core";
import { DatabaseModule, DATABASE, type AgentPayDatabase } from "@agentpay/migrations/database.module";
import { RedisModule } from "@agentpay/redis";
import { KafkaModule } from "@agentpay/kafka";
import { ObservabilityModule } from "@agentpay/observability";
import { CanonicalJsonAdapter } from "@agentpay/canonical-json-adapter";
import { RequestIdMiddleware } from "@agentpay/request-id";
import { IdempotencyInterceptor } from "@agentpay/idempotency";
import { PolicyEngineController } from "./policy-engine.controller";
import { PolicyEngineService } from "./policy-engine.service";
import type { Kysely } from "kysely";

@Module({
  imports: [DatabaseModule, RedisModule, KafkaModule, ObservabilityModule],
  controllers: [PolicyEngineController],
  providers: [
    PolicyEngineService,
    CanonicalJsonAdapter,
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
    },
    {
      provide: APP_INTERCEPTOR,
      inject: [DATABASE],
      useFactory: (db: Kysely<AgentPayDatabase>) => new IdempotencyInterceptor(db as any),
    },
  ],
})
export class PolicyEngineModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
