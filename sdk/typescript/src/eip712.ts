/**
 * EIP-712 typed data signing helper using @noble/curves.
 *
 * Implements the EIP-712 standard for hashing and signing structured data
 * using secp256k1 (via @noble/curves).
 *
 * Reference: https://eips.ethereum.org/EIPS/eip-712
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/curves/abstract/utils";

/**
 * EIP-712 typed data types definition.
 */
interface TypedDataTypes {
  [key: string]: readonly { name: string; type: string }[];
}

/**
 * EIP-712 typed data domain.
 */
interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

/**
 * Full EIP-712 typed data payload.
 */
interface TypedData {
  domain: TypedDataDomain;
  types: TypedDataTypes;
  primaryType: string;
  message: Record<string, unknown>;
}

/**
 * Sign EIP-712 typed data with a private key using noble-curves secp256k1.
 *
 * @param privateKey - 32-byte private key as hex (with or without 0x prefix)
 * @param typedData - The EIP-712 typed data to sign
 * @returns The signature as a 0x-prefixed hex string (r || s || v)
 */
export function signTypedData(
  privateKey: `0x${string}`,
  typedData: TypedData,
): `0x${string}` {
  const digest = hashTypedData(typedData);

  const keyBytes = hexToBytes(
    privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey,
  );

  const sig = secp256k1.sign(digest, keyBytes);

  // Convert to r || s || v format (65 bytes)
  const r = sig.r.toString(16).padStart(64, "0");
  const s = sig.s.toString(16).padStart(64, "0");
  const v = (sig.recovery! + 27).toString(16).padStart(2, "0");

  return `0x${r}${s}${v}`;
}

/**
 * Hash EIP-712 typed data according to the standard.
 *
 * Computes: keccak256(0x1901 || domainSeparator || hashStruct(message))
 */
function hashTypedData(typedData: TypedData): Uint8Array {
  const domainSeparator = hashStruct("EIP712Domain", typedData.domain as Record<string, unknown>, typedData.types);
  const messageHash = hashStruct(typedData.primaryType, typedData.message, typedData.types);

  const combined = new Uint8Array(2 + domainSeparator.length + messageHash.length);
  combined[0] = 0x19;
  combined[1] = 0x01;
  combined.set(domainSeparator, 2);
  combined.set(messageHash, 2 + domainSeparator.length);

  return keccak_256(combined);
}

/**
 * Hash a struct according to EIP-712:
 *   keccak256(encodeType(type) || encodeData(data))
 */
function hashStruct(
  typeName: string,
  data: Record<string, unknown>,
  types: TypedDataTypes,
): Uint8Array {
  const typeDef = types[typeName];
  if (!typeDef) {
    throw new Error(`Unknown EIP-712 type: ${typeName}`);
  }

  const typeHash = hashType(typeName, typeDef, types);
  const encodedData = encodeData(typeDef, data, types);

  const combined = new Uint8Array(typeHash.length + encodedData.length);
  combined.set(typeHash, 0);
  combined.set(encodedData, typeHash.length);

  return keccak_256(combined);
}

/**
 * Compute the type hash: keccak256(encodeType(typeName))
 */
function hashType(
  typeName: string,
  typeDef: readonly { name: string; type: string }[],
  types: TypedDataTypes,
): Uint8Array {
  const encoded = encodeType(typeName, typeDef, types);
  const encoder = new TextEncoder();
  return keccak_256(encoder.encode(encoded));
}

/**
 * Encode a type signature: "TypeName(type1 type2,type3 type4)SubType(type5 type6)"
 */
function encodeType(
  typeName: string,
  typeDef: readonly { name: string; type: string }[],
  types: TypedDataTypes,
): string {
  const seen = new Set<string>();
  const deps = collectDeps(typeDef, types, seen);

  const sortedDeps = [...deps].sort();

  let result = "";
  for (const dep of sortedDeps) {
    const depDef = types[dep];
    if (!depDef) continue;
    result += `${dep}(${depDef.map((f) => `${f.type} ${f.name}`).join(",")})`;
  }

  result += `${typeName}(${typeDef.map((f) => `${f.type} ${f.name}`).join(",")})`;
  return result;
}

/**
 * Collect dependent reference types recursively.
 */
function collectDeps(
  typeDef: readonly { name: string; type: string }[],
  types: TypedDataTypes,
  seen: Set<string>,
): Set<string> {
  for (const field of typeDef) {
    const baseType = field.type.replace(/\[\d*\]$/, "");
    if (baseType in types && !seen.has(baseType)) {
      seen.add(baseType);
      collectDeps(types[baseType]!, types, seen);
    }
  }
  return seen;
}

/**
 * Encode struct data: for each field, encode the value according to its type.
 */
function encodeData(
  typeDef: readonly { name: string; type: string }[],
  data: Record<string, unknown>,
  types: TypedDataTypes,
): Uint8Array {
  const chunks: Uint8Array[] = [];

  for (const field of typeDef) {
    const value = data[field.name];
    const encoded = encodeField(field.type, value, types);
    chunks.push(encoded);
  }

  // Concatenate all chunks
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Encode a single field value according to EIP-712 encoding rules.
 */
function encodeField(
  type: string,
  value: unknown,
  types: TypedDataTypes,
): Uint8Array {
  // Handle array types
  if (type.endsWith("[]")) {
    const elemType = type.slice(0, -2);
    const arr = value as unknown[];
    const encodedElems = arr.map((v) => encodeField(elemType, v, types));
    const totalLen = encodedElems.reduce((s, e) => s + e.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const elem of encodedElems) {
      result.set(elem, offset);
      offset += elem.length;
    }
    return keccak_256(result);
  }

  // Reference types (structs)
  if (type in types) {
    return hashStruct(type, value as Record<string, unknown>, types);
  }

  // Atomic types
  switch (type) {
    case "address":
      return padTo32(hexToBytes((value as string).toLowerCase().replace(/^0x/, "")));
    case "bool":
      return padTo32(new Uint8Array([(value as boolean) ? 1 : 0]));
    case "bytes32":
      return ensureBytes32(value as string);
    case "string":
      return keccak_256(new TextEncoder().encode(value as string));
    case "uint256":
    case "uint128":
    case "uint64":
    case "uint32":
    case "uint16":
    case "uint8":
      return padTo32(bigIntToBytes(BigInt(value as string | number)));
    case "bytes":
      return keccak_256(
        typeof value === "string"
          ? hexToBytes((value as string).replace(/^0x/, ""))
          : new Uint8Array(value as ArrayBuffer),
      );
    default:
      throw new Error(`Unsupported EIP-712 type: ${type}`);
  }
}

/**
 * Pad bytes to 32 bytes (left-padded with zeros).
 */
function padTo32(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 32) return bytes;
  const padded = new Uint8Array(32);
  padded.set(bytes, 32 - bytes.length);
  return padded;
}

/**
 * Ensure a 0x-prefixed hex string is exactly 32 bytes.
 */
function ensureBytes32(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  if (clean.length !== 64) {
    throw new Error(`Expected 32-byte hex string, got ${clean.length / 2} bytes`);
  }
  return hexToBytes(clean);
}

/**
 * Convert a BigInt to big-endian bytes (minimal length).
 */
function bigIntToBytes(n: bigint): Uint8Array {
  if (n === 0n) return new Uint8Array(1);
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return hexToBytes(hex);
}
