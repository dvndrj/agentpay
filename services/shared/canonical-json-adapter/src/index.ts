import { Injectable, BadRequestException } from "@nestjs/common";
import {
  encode,
  decode,
  hash,
  CanonicalJsonError,
} from "@agentpay/canonical-json";

/**
 * NestJS injectable wrapper around @agentpay/canonical-json.
 *
 * Provides a service-layer API for encoding/decoding/hashing canonical JSON
 * values. Parsing errors are thrown as NestJS BadRequestException with the
 * structured error path and reason from CanonicalJsonError.
 */
@Injectable()
export class CanonicalJsonAdapter {
  /**
   * Encode a value into canonical JSON bytes.
   */
  encode(value: unknown): string {
    return encode(value);
  }

  /**
   * Decode canonical JSON text into a typed value.
   * Throws BadRequestException on schema violations.
   */
  decode<T = unknown>(text: string): T {
    try {
      return decode(text) as T;
    } catch (err) {
      if (err instanceof CanonicalJsonError) {
        throw new BadRequestException({
          code: "invalid_payment_request",
          message: `Canonical JSON parse error at ${err.path}: ${err.reason}`,
          details: { path: err.path, reason: err.reason },
        });
      }
      throw new BadRequestException({
        code: "invalid_payment_request",
        message: "Invalid JSON",
      });
    }
  }

  /** Compute sha256 hash of the canonical bytes of the value. */
  hash(value: unknown): Uint8Array {
    return hash(value);
  }
}
