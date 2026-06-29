import { Module, ValidationPipe, MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { APP_PIPE, APP_INTERCEPTOR } from "@nestjs/core";
import { DatabaseModule, DATABASE, type AgentPayDatabase } from "@agentpay/migrations/database.module";
import { RedisModule } from "@agentpay/redis";
import { KafkaModule } from "@agentpay/kafka";
import { ObservabilityModule } from "@agentpay/observability";
import { CanonicalJsonAdapter } from "@agentpay/canonical-json-adapter";
import { RequestIdMiddleware } from "@agentpay/request-id";
import { IdempotencyInterceptor } from "@agentpay/idempotency";
import { AuditLoggerController } from "./audit-logger.controller";
import { AuditLoggerService } from "./audit-logger.service";
import type { Kysely } from "kysely";

@Module({
  imports: [DatabaseModule, RedisModule, KafkaModule, ObservabilityModule],
  controllers: [AuditLoggerController],
  providers: [
    AuditLoggerService,
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
export class AuditLoggerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
