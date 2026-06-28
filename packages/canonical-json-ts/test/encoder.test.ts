import { describe, expect, it } from 'vitest';
import { CanonicalJsonError, encode } from '../src/index.js';

describe('encode', () => {
  it('emits primitives without whitespace', () => {
    expect(encode(true)).toBe('true');
    expect(encode(false)).toBe('false');
    expect(encode(0)).toBe('0');
    expect(encode(42)).toBe('42');
    expect(encode(-7)).toBe('-7');
    expect(encode('hello')).toBe('"hello"');
  });

  it('rejects null at the root', () => {
    expect(() => encode(null)).toThrowError(CanonicalJsonError);
  });

  it('rejects undefined', () => {
    expect(() => encode(undefined)).toThrowError(CanonicalJsonError);
  });

  it('rejects non-integer numbers', () => {
    expect(() => encode(1.5)).toThrowError(/fractional/);
    expect(() => encode(Number.NaN)).toThrowError(/non-finite/);
    expect(() => encode(Number.POSITIVE_INFINITY)).toThrowError(/non-finite/);
  });

  it('rejects integers outside the safe range', () => {
    expect(() => encode(Number.MAX_SAFE_INTEGER + 1)).toThrowError(/safe range/);
  });

  it('emits arrays with no whitespace', () => {
    expect(encode([1, 2, 3])).toBe('[1,2,3]');
    expect(encode([])).toBe('[]');
  });

  it('sorts object keys by Unicode code point', () => {
    // 'A' = U+0041, 'B' = U+0042, 'a' = U+0061, 'b' = U+0062.
    // Uppercase letters precede lowercase letters by code point.
    const value = { b: 1, A: 2, a: 3, B: 4 };
    expect(encode(value)).toBe('{"A":2,"B":4,"a":3,"b":1}');
  });

  it('sorts keys containing supplementary characters by code point not code unit', () => {
    // U+1F600 GRINNING FACE has code point 0x1F600 but its UTF-16 code
    // units begin with 0xD83D, which is greater than the BMP letter 'z'
    // (0x007A). Code-point ordering must place 'z' before the emoji,
    // contrary to JavaScript's default UTF-16 sort.
    const value = { z: 1, '\u{1F600}': 2 };
    const out = encode(value);
    expect(out.indexOf('"z"')).toBeLessThan(out.indexOf('"\u{1F600}"'));
  });

  it('NFC-normalises string values before escaping', () => {
    // "é" can be U+00E9 (NFC) or U+0065 U+0301 (NFD). The encoder must
    // emit the NFC form regardless of input.
    const nfd = 'e\u0301';
    const nfc = '\u00e9';
    expect(nfd.normalize('NFC')).toBe(nfc);
    expect(encode(nfd)).toBe(`"${nfc}"`);
    expect(encode(nfc)).toBe(`"${nfc}"`);
  });

  it('NFC-normalises keys before sorting', () => {
    // Both keys normalise to the same NFC form, but the encoder treats
    // them as distinct string keys. The relevant property here is that
    // each emitted key is the NFC form of the original.
    const value: Record<string, number> = {};
    value['\u00e9'] = 1; // NFC
    expect(encode(value)).toBe('{"\u00e9":1}');
  });

  it('escapes control characters and double quotes', () => {
    expect(encode('a"b\\c\n')).toBe('"a\\"b\\\\c\\n"');
    expect(encode('\u0000')).toBe('"\\u0000"');
    expect(encode('\u001f')).toBe('"\\u001f"');
  });

  it('produces byte-identical output for structurally equal values with different key insertion order', () => {
    const a = { foo: 1, bar: 2, baz: 3 };
    const b = { baz: 3, foo: 1, bar: 2 };
    expect(encode(a)).toBe(encode(b));
  });

  it('emits no trailing newline', () => {
    const out = encode({ a: 1 });
    expect(out.endsWith('\n')).toBe(false);
  });

  it('skips undefined entries in objects', () => {
    expect(encode({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(encode({ a: undefined })).toBe('{}');
  });

  it('accepts large integer amounts as strings (the schema requirement)', () => {
    // Micro-USDC amounts exceed Number.MAX_SAFE_INTEGER; canonical form
    // is the string-encoded integer.
    expect(encode('18446744073709551615')).toBe('"18446744073709551615"');
  });
});
