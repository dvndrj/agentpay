import type { AgentPayConfig, AgentPayError } from "./types";

/**
 * HTTP client wrapper for the AgentPay SDK.
 *
 * Handles:
 * - Base URL resolution
 * - API key auth header
 * - JSON request/response serialization
 * - Structured error mapping (AgentPay error envelope → AgentPayError)
 */
export class AgentPayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(config: AgentPayConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Make a GET request to the AgentPay API.
   */
  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  /**
   * Make a POST request to the AgentPay API.
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  /**
   * Make a PUT request to the AgentPay API.
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  /**
   * Make a DELETE request to the AgentPay API.
   */
  async delete(path: string): Promise<void> {
    await this.request<unknown>("DELETE", path);
  }

  /**
   * Core request method with error handling.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      if (contentType.includes("application/json")) {
        const errorBody = (await response.json()) as AgentPayError;
        throw new AgentPayApiError(
          errorBody.code ?? "unknown_error",
          errorBody.message ?? `HTTP ${response.status}`,
          response.status,
          errorBody.details,
          errorBody.requestId,
          errorBody.policyDecisionId,
        );
      }
      throw new AgentPayApiError(
        "http_error",
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

/**
 * Structured AgentPay API error.
 *
 * Wraps the error envelope returned by AgentPay services:
 * { code, message, details, request_id, policy_decision_id }
 */
export class AgentPayApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
    public readonly details?: Record<string, unknown>,
    public readonly requestId?: string,
    public readonly policyDecisionId?: string | null,
  ) {
    super(message);
    this.name = "AgentPayApiError";
  }
}
