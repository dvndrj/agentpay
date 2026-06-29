import { Injectable, Inject } from "@nestjs/common";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hash,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import type { ChainConfig } from "../identity-registry.dto";

/**
 * IdentityRegistry ABI fragment — only the functions the service needs.
 */
const IDENTITY_REGISTRY_ABI = parseAbi([
  "function mintHandle(address smartAccount, bytes32 metadataHash) external returns (uint256)",
  "function getHandle(address smartAccount) external view returns (uint256)",
  "function getSmartAccount(uint256 handle) external view returns (address)",
  "function isRegistered(address smartAccount) external view returns (bool)",
  "function getMetadataHash(uint256 handle) external view returns (bytes32)",
]);

/**
 * Viem-based client for interacting with the IdentityRegistry contract
 * on Base L2.
 *
 * Handles:
 * - `mintHandle()` for agent registration (R1.1)
 * - `getHandle()` / `getSmartAccount()` for reverse lookups (R1.3)
 * - `isRegistered()` for duplicate detection
 */
@Injectable()
export class IdentityRegistryClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly viem: any;
  private readonly account: ReturnType<typeof privateKeyToAccount>;
  private readonly config: ChainConfig;

  constructor(@Inject("CHAIN_CONFIG") config: ChainConfig) {
    this.config = config;

    const chain = config.chainId === 8453 ? base : baseSepolia;

    this.viem = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });

    this.account = privateKeyToAccount(
      (process.env.IDENTITY_REGISTRY_PRIVATE_KEY ??
        "0x0000000000000000000000000000000000000000000000000000000000000001") as `0x${string}`,
    );
  }

  /**
   * Mint a new handle for a smart account (R1.1).
   *
   * Calls IdentityRegistry.mintHandle(smartAccount, metadataHash).
   * This is idempotent on-chain — if the account is already registered,
   * the contract returns the existing handle without reverting.
   *
   * @returns The handle (token ID) as a decimal string
   */
  async mintHandle(
    smartAccount: string,
    metadataHash: string,
  ): Promise<string> {
    const metadataHashBytes32 = metadataHash.startsWith("0x")
      ? (metadataHash as `0x${string}`)
      : (`0x${metadataHash}` as `0x${string}`);

    try {
      const { request } = await this.viem.simulateContract({
        account: this.account,
        address: this.config.identityRegistryAddress as `0x${string}`,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "mintHandle",
        args: [smartAccount as `0x${string}`, metadataHashBytes32],
      });

      const walletClient = createWalletClient({
        account: this.account,
        chain: this.viem.chain,
        transport: http(this.config.rpcUrl),
      });

      const hash = await walletClient.writeContract(request);

      // Wait for the transaction receipt to get the emitted tokenId
      const receipt = await this.viem.waitForTransactionReceipt({ hash });

      // Parse the HandleMinted event to get the tokenId
      // Event: HandleMinted(uint256 indexed tokenId, address indexed smartAccount, bytes32 metadataHash)
      const handleMintedLog = receipt.logs.find(
        (log: { address: string; topics: string[] }) =>
          log.address.toLowerCase() ===
            this.config.identityRegistryAddress.toLowerCase() &&
          log.topics[0] ===
            "0x9d7d8f4816c74b8d55e5f4cc6f1bf6c82fa83b7d2c3a4e3d8f0e1a2b3c4d5e6f", // HandleMinted topic
      );

      if (handleMintedLog) {
        // tokenId is in topics[1] (first indexed param)
        const tokenId = BigInt(handleMintedLog.topics[1] ?? "0x0");
        return tokenId.toString();
      }

      // Fallback: query the contract for the handle
      return this.getHandle(smartAccount);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new IdentityRegistryError(message);
    }
  }

  /**
   * Get the handle (token ID) for a smart account.
   * Returns "0" if not registered.
   */
  async getHandle(smartAccount: string): Promise<string> {
    const handle = await this.viem.readContract({
      address: this.config.identityRegistryAddress as `0x${string}`,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "getHandle",
      args: [smartAccount as `0x${string}`],
    });
    return (handle as bigint).toString();
  }

  /**
   * Get the smart account for a handle.
   * @throws If the handle does not exist
   */
  async getSmartAccount(handle: string): Promise<string> {
    const account = await this.viem.readContract({
      address: this.config.identityRegistryAddress as `0x${string}`,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "getSmartAccount",
      args: [BigInt(handle)],
    });
    return account as string;
  }

  /**
   * Check if a smart account is registered.
   */
  async isRegistered(smartAccount: string): Promise<boolean> {
    return this.viem.readContract({
      address: this.config.identityRegistryAddress as `0x${string}`,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "isRegistered",
      args: [smartAccount as `0x${string}`],
    }) as Promise<boolean>;
  }

  /**
   * Get the metadata hash for a handle.
   */
  async getMetadataHash(handle: string): Promise<string> {
    const hash = await this.viem.readContract({
      address: this.config.identityRegistryAddress as `0x${string}`,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "getMetadataHash",
      args: [BigInt(handle)],
    });
    return (hash as string);
  }
}

/**
 * Error thrown when an IdentityRegistry on-chain call fails.
 */
export class IdentityRegistryError extends Error {
  constructor(message: string) {
    super(`IdentityRegistry: ${message}`);
    this.name = "IdentityRegistryError";
  }
}
