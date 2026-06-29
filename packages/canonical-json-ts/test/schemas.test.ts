import { describe, expect, it } from 'vitest';
import {
  CanonicalJsonError,
  EvidenceEnvelopeSchema,
  ObligationObjectSchema,
  PaymentRequestSchema,
  PolicySchema,
  SessionKeySchema,
  decode,
  encode,
  encodeAllowingNulls,
  validate,
} from '../src/index.js';

const sampleObligation = {
  obligation_id: '018f9e3c-3e8c-7b2c-9b22-1234567890ab',
  sla_id: '018f9e3c-3e8c-7b2c-9b22-aaaaaaaaaaaa',
  consumer_handle: '17',
  provider_handle: '42',
  consumer_smart_account: '0x' + 'a'.repeat(40),
  provider_smart_account: '0x' + 'b'.repeat(40),
  amount_usdc: '1000000',
  asset: 'USDC',
  network: 'base-sepolia',
  nonce: 'nonce-1',
  finality_state: 'DRAFT',
  policy_decision_id: '018f9e3c-3e8c-7b2c-9b22-bbbbbbbbbbbb',
  created_at: '2025-01-02T03:04:05Z',
  tx_hash: null,
  evidence_hash: null,
  schema_version: 1,
} as const;

describe('ObligationObjectSchema', () => {
  it('accepts a well-formed DRAFT obligation with null tx_hash and evidence_hash', () => {
    expect(() => validate(sampleObligation, ObligationObjectSchema)).not.toThrow();
  });

  it('round-trips through decode(encode(...))', () => {
    const encoded = encodeAllowingNulls(validate(sampleObligation, ObligationObjectSchema));
    const decoded = decode(encoded, ObligationObjectSchema);
    expect(decoded).toEqual(sampleObligation);
    // Second round-trip is byte-identical.
    expect(encodeAllowingNulls(validate(decoded, ObligationObjectSchema))).toBe(encoded);
  });

  it('rejects a non-DRAFT obligation with null tx_hash', () => {
    const provisional = { ...sampleObligation, finality_state: 'PROVISIONAL' as const };
    try {
      validate(provisional, ObligationObjectSchema);
      throw new Error('expected CanonicalJsonError');
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalJsonError);
      const e = err as CanonicalJsonError;
      expect(e.path).toBe('/tx_hash');
      expect(e.reason).toMatch(/null is not permitted/);
    }
  });

  it('reports the correct path and reason for a missing required field', () => {
    const { amount_usdc: _omitted, ...rest } = sampleObligation;
    try {
      validate(rest, ObligationObjectSchema);
      throw new Error('expected CanonicalJsonError');
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalJsonError);
      const e = err as CanonicalJsonError;
      expect(e.path).toBe('/amount_usdc');
      expect(e.reason).toMatch(/missing required field/);
    }
  });

  it('reports the correct path and reason for a wrong-type field', () => {
    const broken = { ...sampleObligation, amount_usdc: 1000000 as unknown as string };
    try {
      validate(broken, ObligationObjectSchema);
      throw new Error('expected CanonicalJsonError');
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalJsonError);
      const e = err as CanonicalJsonError;
      expect(e.path).toBe('/amount_usdc');
      expect(e.reason).toMatch(/integer-as-string/);
    }
  });

  it('rejects unknown fields', () => {
    const broken = { ...sampleObligation, extra: 'nope' };
    try {
      validate(broken, ObligationObjectSchema);
      throw new Error('expected CanonicalJsonError');
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalJsonError);
      const e = err as CanonicalJsonError;
      expect(e.path).toBe('/extra');
      expect(e.reason).toMatch(/unknown field/);
    }
  });

  it('rejects an integer-as-string with leading zeros', () => {
    const broken = { ...sampleObligation, amount_usdc: '0123' };
    expect(() => validate(broken, ObligationObjectSchema)).toThrowError(/integer-as-string/);
  });

  it('rejects a non-Z timestamp', () => {
    const broken = { ...sampleObligation, created_at: '2025-01-02T03:04:05+00:00' };
    try {
      validate(broken, ObligationObjectSchema);
      throw new Error('expected CanonicalJsonError');
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalJsonError);
      const e = err as CanonicalJsonError;
      expect(e.path).toBe('/created_at');
      expect(e.reason).toMatch(/Z/);
    }
  });
});

describe('EvidenceEnvelopeSchema', () => {
  const sampleEnvelope = {
    envelope_id: '018f9e3c-3e8c-7b2c-9b22-cccccccccccc',
    obligation_id: '018f9e3c-3e8c-7b2c-9b22-1234567890ab',
    sla_id: '018f9e3c-3e8c-7b2c-9b22-aaaaaaaaaaaa',
    request_hash: 'a'.repeat(64),
    response_hash: 'b'.repeat(64),
    log_attestation: {
      log_digest: 'c'.repeat(64),
      signer_handle: '42',
      signature: 'd'.repeat(128),
    },
    tee_attestation: null,
    observed_latency_ms: 150,
    produced_at: '2025-01-02T03:04:05Z',
    prev_hash: 'e'.repeat(64),
    envelope_hash: 'f'.repeat(64),
    schema_version: 1,
  } as const;

  it('accepts a log-only envelope', () => {
    expect(() => validate(sampleEnvelope, EvidenceEnvelopeSchema)).not.toThrow();
  });

  it('round-trips through encode/decode preserving key order canonically', () => {
    const text = encodeAllowingNulls(validate(sampleEnvelope, EvidenceEnvelopeSchema));
    const decoded = decode(text, EvidenceEnvelopeSchema);
    expect(decoded).toEqual(sampleEnvelope);
    expect(encodeAllowingNulls(validate(decoded, EvidenceEnvelopeSchema))).toBe(text);
  });
});

describe('PolicySchema', () => {
  it('rejects an invalid 0x-address', () => {
    const broken = {
      smart_account: '0xZZ',
      per_tx_cap_usdc_micro: '1000000',
      daily_cap_usdc_micro: '100000000',
      rolling_24h_spend_usdc_micro: '0',
      updated_at: '2025-01-02T03:04:05Z',
      schema_version: 1,
    };
    try {
      validate(broken, PolicySchema);
      throw new Error('expected CanonicalJsonError');
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalJsonError);
      const e = err as CanonicalJsonError;
      expect(e.path).toBe('/smart_account');
    }
  });
});

describe('SessionKeySchema', () => {
  it('accepts an ACTIVE key with null revoked_at and unrestricted recipients', () => {
    const key = {
      key_id: '018f9e3c-3e8c-7b2c-9b22-dddddddddddd',
      smart_account: '0x' + 'a'.repeat(40),
      public_key: 'a'.repeat(128),
      not_before: '2025-01-01T00:00:00Z',
      not_after: '2025-12-31T23:59:59Z',
      bounds: {
        per_tx_cap_usdc_micro: '1000000',
        cumulative_cap_usdc_micro: '100000000',
        allowed_recipients: null,
      },
      status: 'ACTIVE',
      issued_at: '2025-01-01T00:00:00Z',
      revoked_at: null,
      schema_version: 1,
    };
    expect(() => validate(key, SessionKeySchema)).not.toThrow();
  });

  it('rejects a REVOKED key with null revoked_at', () => {
    const key = {
      key_id: '018f9e3c-3e8c-7b2c-9b22-dddddddddddd',
      smart_account: '0x' + 'a'.repeat(40),
      public_key: 'a'.repeat(128),
      not_before: '2025-01-01T00:00:00Z',
      not_after: '2025-12-31T23:59:59Z',
      bounds: {
        per_tx_cap_usdc_micro: '1000000',
        cumulative_cap_usdc_micro: '100000000',
        allowed_recipients: null,
      },
      status: 'REVOKED',
      issued_at: '2025-01-01T00:00:00Z',
      revoked_at: null,
      schema_version: 1,
    };
    expect(() => validate(key, SessionKeySchema)).toThrowError(/null is not permitted/);
  });
});

describe('PaymentRequestSchema', () => {
  it('round-trips a PaymentRequest', () => {
    const request = {
      smart_account: '0x' + 'a'.repeat(40),
      sla_id: '018f9e3c-3e8c-7b2c-9b22-aaaaaaaaaaaa',
      charge: {
        amount_usdc_micro: '50000',
        asset: 'USDC',
        network: 'base-mainnet',
        recipient: '0x' + 'b'.repeat(40),
        nonce: 'nonce-1',
      },
      session_key_id: '018f9e3c-3e8c-7b2c-9b22-dddddddddddd',
      session_key_signature: 'a'.repeat(128),
      request_id: '018f9e3c-3e8c-7b2c-9b22-eeeeeeeeeeee',
      submitted_at: '2025-01-02T03:04:05Z',
      schema_version: 1,
    };
    const text = encode(validate(request, PaymentRequestSchema));
    expect(decode(text, PaymentRequestSchema)).toEqual(request);
  });

  it('rejects an unknown network', () => {
    const broken = {
      smart_account: '0x' + 'a'.repeat(40),
      sla_id: '018f9e3c-3e8c-7b2c-9b22-aaaaaaaaaaaa',
      charge: {
        amount_usdc_micro: '50000',
        asset: 'USDC',
        network: 'ethereum-mainnet',
        recipient: '0x' + 'b'.repeat(40),
        nonce: 'nonce-1',
      },
      session_key_id: '018f9e3c-3e8c-7b2c-9b22-dddddddddddd',
      session_key_signature: 'a'.repeat(128),
      request_id: '018f9e3c-3e8c-7b2c-9b22-eeeeeeeeeeee',
      submitted_at: '2025-01-02T03:04:05Z',
      schema_version: 1,
    };
    try {
      validate(broken, PaymentRequestSchema);
      throw new Error('expected CanonicalJsonError');
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalJsonError);
      const e = err as CanonicalJsonError;
      expect(e.path).toBe('/charge/network');
      expect(e.reason).toMatch(/enum/);
    }
  });
});
