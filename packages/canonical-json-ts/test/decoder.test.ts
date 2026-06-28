import { describe, expect, it } from 'vitest';
import { CanonicalJsonError, decode } from '../src/index.js';

describe('decode', () => {
  it('parses valid JSON to JavaScript values', () => {
    expect(decode('{"a":1}')).toEqual({ a: 1 });
    expect(decode('[1,2,3]')).toEqual([1, 2, 3]);
    expect(decode('"hi"')).toBe('hi');
    expect(decode('true')).toBe(true);
  });

  it('throws CanonicalJsonError on invalid JSON', () => {
    try {
      decode('{not json');
      throw new Error('expected CanonicalJsonError');
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalJsonError);
      const e = err as CanonicalJsonError;
      expect(e.path).toBe('');
      expect(e.reason).toMatch(/invalid JSON/);
    }
  });

  it('rejects non-string inputs', () => {
    expect(() => decode(42 as unknown as string)).toThrowError(CanonicalJsonError);
  });
});
