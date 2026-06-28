import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encode, hash } from '../src/index.js';

describe('hash', () => {
  it('returns a 32-byte Uint8Array', () => {
    const out = hash({ a: 1 });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.byteLength).toBe(32);
  });

  it('matches sha256(encode(value))', () => {
    const value = { foo: 'bar', baz: [1, 2, 3] };
    const expected = createHash('sha256').update(encode(value), 'utf8').digest();
    const actual = hash(value);
    expect(Buffer.from(actual).equals(expected)).toBe(true);
  });

  it('is stable under structurally equal inputs with different key order', () => {
    expect(Buffer.from(hash({ a: 1, b: 2 })).toString('hex')).toBe(
      Buffer.from(hash({ b: 2, a: 1 })).toString('hex'),
    );
  });
});
