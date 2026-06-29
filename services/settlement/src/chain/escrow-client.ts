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
import type { ChainConfig } from "../settlement.dto";

/**
 * EscrowVault ABI fragment — only the functions Settlement needs.
 */
const ESCROW_VAULT_ABI = parseAbi([
  "function lock(bytes32 obligationId, address payer, address payee, uint256 amount) external",
  "function getEscrow(bytes32 obligationId) external view returns ((address payer, address payee, uint256 amount, uint8 state))",
]);

/**
 * Viem-based client for interacting with the EscrowVault contract on Base L2.
 *
 * Handles:
 * - Submitting `lock()` transactions for escrow creation (R4.2)
 * - Watching transaction confirmations (R4.3)
 * - Handling revert reasons on failure (R4.5)
 *
 * All on-chain writes use the RAILS_SETTLER_ROLE key.
 * `lock()` is permissionless — anyone can call it with USDC approval.
 */
@Injectable()
export class EscrowClient {
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

    // Use a private key from env for signing transactions.
    // In production, use a secure key management solution (HSM, KMS).
    this.account = privateKeyToAccount(
      (process.env.SETTLEMENT_PRIVATE_KEY ?? "0x0000000000000000000000000000000000000000000000000000000000000001") as `0x${string}`,
    );
  }

  /**
   * Submit a `lock()` transaction to EscrowVault.
   *
   * EscrowVault.lock(bytes32 obligationId, address payer, address payee, uint256 amount)
   *
   * The obligationId bytes32 is derived from the UUIDv7 obligation ID
   * by taking the first 32 bytes of the hex representation.
   *
   * @returns The transaction hash
   * @throws On revert with the revert reason
   */
  async lock(
    obligationId: string,
    payer: string,
    payee: string,
    amount: string,
  ): Promise<Hash> {
    const obligationIdBytes32 = this.uuidToBytes32(obligationId);

    try {
      const { request } = await this.viem.simulateContract({
        account: this.account,
        address: this.config.escrowVaultAddress as `0x${string}`,
        abi: ESCROW_VAULT_ABI,
        functionName: "lock",
        args: [obligationIdBytes32, payer as `0x${string}`, payee as `0x${string}`, BigInt(amount)],
      });

      const walletClient = createWalletClient({
        account: this.account,
        chain: this.viem.chain,
        transport: http(this.config.rpcUrl),
      });
      const hash = await walletClient.writeContract(request);
      return hash;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new EscrowRevertError(message, obligationId);
    }
  }

  /**
   * Wait for a transaction to receive k confirmations on Base L2.
   *
   * Base L2 block time is ~2 seconds. 3 confirmations is ~6 seconds,
   * which is sufficient for L2 finality in MVP (R4.3).
   *
   * @returns The transaction receipt on success
   * @throws On timeout if tx is not confirmed within timeoutMs
   */
  async waitForConfirmations(
    txHash: Hash,
    confirmations: number = 3,
    timeoutMs: number = 120_000,
  ): Promise<{ blockNumber: bigint; status: "success" | "reverted" }> {
    try {
      const receipt = await this.viem.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
        timeout: timeoutMs,
      });

      return {
        blockNumber: receipt.blockNumber,
        status: receipt.status === "success" ? "success" : "reverted",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("timed out") || message.includes("timeout")) {
        throw new EscrowTimeoutError(txHash, timeoutMs);
      }
      throw err;
    }
  }

  /**
   * Get the current block number on the chain.
   */
  async getBlockNumber(): Promise<bigint> {
    return this.viem.getBlockNumber();
  }

  /**
   * Convert a UUIDv7 string to a bytes32 value for EscrowVault.
   *
   * Takes the first 32 bytes of the hex representation of the UUID
   * (after removing dashes), left-padded with zeros if needed.
   */
  private uuidToBytes32(uuid: string): `0x${string}` {
    const hex = uuid.replace(/-/g, "");
    return `0x${hex.padEnd(64, "0")}` as `0x${string}`;
  }
}

/**
 * Error thrown when an EscrowVault transaction reverts on-chain.
 */
export class EscrowRevertError extends Error {
  constructor(
    message: string,
    public readonly obligationId: string,
  ) {
    super(`EscrowVault revert: ${message}`);
    this.name = "EscrowRevertError";
  }
}

/**
 * Error thrown when a transaction is not confirmed within the timeout window.
 */
export class EscrowTimeoutError extends Error {
  constructor(
    public readonly txHash: Hash,
    timeoutMs: number,
  ) {
    super(`Transaction ${txHash} not confirmed within ${timeoutMs}ms`);
    this.name = "EscrowTimeoutError";
  }
}
