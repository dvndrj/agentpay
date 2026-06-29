import { Injectable, NestMiddleware } from "@nestjs/common";
import { v7 as uuidv7 } from "uuid";
import type { Request, Response, NextFunction } from "express";

/** Header name for the request ID propagated across services. */
export const REQUEST_ID_HEADER = "x-request-id";

/** Symbol to store the request ID on the request object for DI injection. */
export const REQUEST_ID_SYMBOL = Symbol("REQUEST_ID");

/**
 * NestJS middleware that ensures every incoming request has a UUIDv7 request ID.
 *
 * - If the `x-request-id` header is present, its value is reused (propagation).
 * - Otherwise, a new UUIDv7 is generated.
 * - The ID is attached to `req[REQUEST_ID_SYMBOL]` so it can be injected into
 *   services via a custom provider.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const existing = req.headers[REQUEST_ID_HEADER];
    const id = typeof existing === "string" && existing.length > 0 ? existing : uuidv7();
    (req as Record<symbol, unknown>)[REQUEST_ID_SYMBOL] = id;
    next();
  }
}
