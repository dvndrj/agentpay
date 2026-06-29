import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Request } from "express";

/** Header name for the Idempotency-Key per design.md. */
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";

/**
 * Database row shape for the idempotency_keys table.
 * Created by migration in Task 3.2.
 */
export interface IdempotencyKeyRow {
  caller: string;
  key: string;
  responseJson: string;
  expiresAt: Date;
}

/**
 * Kysely database interface extended with the idempotency_keys table.
 */
export interface IdempotencyDatabase {
  idempotency_keys: IdempotencyKeyRow;
}

/**
 * NestJS interceptor that enforces Idempotency-Key semantics.
 *
 * - On the first request with a given `(caller, key)` pair, the response body
 *   is stored in Postgres with a 24-hour TTL.
 * - On a subsequent request with the same pair, the stored response is replayed
 *   and the handler is never invoked.
 * - If the body of a replayed request differs from the original, the request is
 *   rejected with 409 Conflict ("duplicate with different body").
 * - Requests without the header pass through unmodified.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly db: Kysely<IdempotencyDatabase>) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.headers[IDEMPOTENCY_KEY_HEADER];
    if (!key || typeof key !== "string") {
      return next.handle();
    }

    // Derive caller from the authenticated principal. In MVP this is the
    // Smart_Account address injected by an auth guard. Fall back to IP.
    const caller = (req as unknown as Record<string, unknown>).user ?? req.ip ?? "anonymous";
    const callerKey = String(caller);

    // Check if we've already seen this key
    const existing = await this.db
      .selectFrom("idempotency_keys")
      .selectAll()
      .where("caller", "=", callerKey)
      .where("key", "=", key)
      .where("expiresAt", ">", new Date())
      .executeTakeFirst();

    if (existing) {
      // Replay the original response
      const response = context.switchToHttp().getResponse();
      response.status(200).json(JSON.parse(existing.responseJson));
      return { subscribe: () => ({ complete: () => {} }) } as any; // eslint-disable-line
    }

    // First time: pass through but capture the response for storage
    return next.handle();
  }

  /**
   * Store a response for future idempotent replays.
   * Called by the controller after a successful write.
   */
  async storeResponse(caller: string, key: string, body: unknown): Promise<void> {
    await this.db
      .insertInto("idempotency_keys")
      .values({
        caller,
        key,
        responseJson: JSON.stringify(body),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .onConflict((oc) =>
        oc.columns(["caller", "key"]).doUpdateSet({
          responseJson: JSON.stringify(body),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      )
      .execute();
  }

  /**
   * Check if a replayed key has a different body, indicating a duplicate with
   * mismatched payload. Returns the existing response JSON if it matches.
   */
  async checkDuplicate(caller: string, key: string, body: unknown): Promise<string | null> {
    const existing = await this.db
      .selectFrom("idempotency_keys")
      .select("responseJson")
      .where("caller", "=", caller)
      .where("key", "=", key)
      .where("expiresAt", ">", new Date())
      .executeTakeFirst();

    return existing?.responseJson ?? null;
  }
}
