import { Module, ValidationPipe, MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { APP_PIPE, APP_INTERCEPTOR } from "@nestjs/core";
import { DatabaseModule, DATABASE, type AgentPayDatabase } from "@agentpay/migrations/database.module";
import { RedisModule } from "@agentpay/redis";
import { KafkaModule } from "@agentpay/kafka";
import { ObservabilityModule } from "@agentpay/observability";
import { RequestIdMiddleware } from "@agentpay/request-id";
import { IdempotencyInterceptor } from "@agentpay/idempotency";
import { RailsLedgerController } from "./rails-ledger.controller";
import { RailsLedgerService } from "./rails-ledger.service";
import type { Kysely } from "kysely";

@Module({
  imports: [DatabaseModule, RedisModule, KafkaModule, ObservabilityModule],
  controllers: [RailsLedgerController],
  providers: [
    RailsLedgerService,
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
    {
      provide: APP_INTERCEPTOR,
      inject: [DATABASE],
      useFactory: (db: Kysely<AgentPayDatabase>) => new IdempotencyInterceptor(db as any),
    },
  ],
})
export class RailsLedgerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
