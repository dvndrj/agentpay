import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { encode, encodeAllowingNulls } from '../src/index.js';

/**
 * Golden vector cross-language interop tests.
 *
 * **Validates: Requirements 12.6**
 *
 * These tests ensure that the TypeScript and Python canonical JSON
 * implementations produce byte-identical output for the same input fixtures.
 * Each golden vector file contains:
 * - description: What the test covers
 * - input: The JSON value to encode
 * - expected_bytes: The exact canonical UTF-8 output as a string
 * - notes: Additional context
 *
 * The same fixtures live in both packages/canonical-json-ts/test/golden/
 * and packages/canonical-json-py/tests/golden/ to ensure cross-language
 * compatibility.
 */

describe('Golden vectors for cross-language interop', () => {
  const goldenDir = join(__dirname, 'golden');
  const goldenFiles = readdirSync(goldenDir).filter((f) => f.endsWith('.json'));

  for (const filename of goldenFiles) {
    it(`golden: ${filename}`, () => {
      const fixturePath = join(goldenDir, filename);
      const fixtureContent = readFileSync(fixturePath, 'utf-8');
      const fixture = JSON.parse(fixtureContent);

      const { input, expected_bytes, description } = fixture;

      // Some fixtures include null values and need encodeAllowingNulls
      const hasNull = JSON.stringify(input).includes('null');
      const actual = hasNull ? encodeAllowingNulls(input) : encode(input);

      expect(actual).toBe(expected_bytes);
      
      // Log description for debugging
      if (actual !== expected_bytes) {
        console.log(`Description: ${description}`);
        console.log(`Expected: ${expected_bytes}`);
        console.log(`Actual:   ${actual}`);
      }
    });
  }

  it('has at least 8 golden vector files', () => {
    // Ensure we have comprehensive coverage
    expect(goldenFiles.length).toBeGreaterThanOrEqual(8);
  });
});

describe('Golden vectors: specific edge cases', () => {
  it('NFC normalization of combining characters', () => {
    // "café" with NFD combining acute accent
    const nfd_cafe = { 'cafe\u0301': 're\u0301sume\u0301' };
    // Should normalize to NFC precomposed forms
    const result = encode(nfd_cafe);
    expect(result).toBe('{"café":"résumé"}');
  });

  it('Key sorting with supplementary plane characters', () => {
    // Emoji (U+1F600) should sort after BMP letters by code point
    const input = { z: 1, '\u{1F600}': 2, a: 3 };
    const result = encode(input);
    // BMP 'a' and 'z' come before emoji U+1F600
    expect(result.indexOf('"a"')).toBeLessThan(result.indexOf('"\u{1F600}"'));
    expect(result.indexOf('"z"')).toBeLessThan(result.indexOf('"\u{1F600}"'));
  });

  it('Null values serialize correctly when allowed', () => {
    const input = { a: null, b: 'present', c: null };
    const result = encodeAllowingNulls(input);
    expect(result).toBe('{"a":null,"b":"present","c":null}');
  });

  it('Integer boundary values', () => {
    const maxSafe = Number.MAX_SAFE_INTEGER;
    const minSafe = Number.MIN_SAFE_INTEGER;
    const input = { max: maxSafe, min: minSafe, zero: 0 };
    const result = encode(input);
    expect(result).toBe(`{"max":${maxSafe},"min":${minSafe},"zero":0}`);
  });

  it('Deeply nested objects maintain key sorting at each level', () => {
    const input = {
      z: { z: 1, a: 2 },
      a: { z: 3, a: 4 },
    };
    const result = encode(input);
    expect(result).toBe('{"a":{"a":4,"z":3},"z":{"a":2,"z":1}}');
  });
});
