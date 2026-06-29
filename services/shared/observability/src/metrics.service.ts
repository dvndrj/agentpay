import { Injectable, type OnModuleInit } from "@nestjs/common";
import {
  collectDefaultMetrics,
  Registry,
  Counter,
  Histogram,
  Gauge,
} from "prom-client";

/**
 * Shared Prometheus metrics for AgentPay services.
 *
 * Each service imports this module. The metrics below correspond to
 * design.md §Observability and are expected to be emitted by every
 * service that handles relevant events.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  // ── Policy_Engine ─────────────────────────────────────────────
  readonly policyDecisionsTotal = new Counter({
    name: "policy_decisions_total",
    help: "Total number of policy decisions",
    labelNames: ["verdict", "reason_code"],
    registers: [this.registry],
  });

  // ── Settlement_Service ────────────────────────────────────────
  readonly settlementLatencySeconds = new Histogram({
    name: "settlement_latency_seconds",
    help: "Settlement latency in seconds",
    labelNames: ["network"],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [this.registry],
  });

  // ── Audit_Logger ──────────────────────────────────────────────
  readonly auditChainLength = new Gauge({
    name: "audit_chain_length",
    help: "Number of records in the audit chain per handle",
    labelNames: ["handle"],
    registers: [this.registry],
  });

  // ── RAILS_Ledger ──────────────────────────────────────────────
  readonly obligationStateTransitionsTotal = new Counter({
    name: "obligation_state_transitions_total",
    help: "Total number of obligation state transitions",
    labelNames: ["from", "to"],
    registers: [this.registry],
  });

  // ── Policy_Engine / session keys ──────────────────────────────
  readonly sessionKeyRevocationsTotal = new Counter({
    name: "session_key_revocations_total",
    help: "Total number of session key revocations",
    labelNames: [],
    registers: [this.registry],
  });

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry });
  }

  /** Return all metrics as text for the /metrics endpoint. */
  async getMetricsText(): Promise<string> {
    return this.registry.metrics();
  }
}
