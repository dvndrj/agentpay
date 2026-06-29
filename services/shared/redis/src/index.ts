import { Global, Module } from "@nestjs/common";
import Redis from "ioredis";

/** Token for NestJS DI. */
export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

/**
 * Channel name for session key revocation pub/sub (R13.3).
 * Policy_Engine instances subscribe to this channel to invalidate
 * their in-memory session-key cache within 10 seconds.
 */
export const SESSION_KEY_REVOKED_CHANNEL = "session_key.revoked";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const url = process.env.REDIS_URL ?? "redis://localhost:6379";
        const client = new Redis(url, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
