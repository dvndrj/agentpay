import { Global, Module } from "@nestjs/common";
import { Kafka, type Producer, type Consumer, type EachMessagePayload } from "kafkajs";

/** Token for NestJS DI. */
export const KAFKA_PRODUCER = Symbol("KAFKA_PRODUCER");
export const KAFKA_CONSUMER = Symbol("KAFKA_CONSUMER");

/**
 * AgentPay Kafka topic names per design.md §Architecture.
 *
 *   audit.events            — Audit_Logger appends (R10.1)
 *   obligation.transitions  — RAILS_Ledger state changes (R9.5)
 *   policy.decisions        — Policy_Engine verdicts (R8)
 *   session_key.revocations — Redis pub/sub fallback (R13.3)
 */
export const TOPICS = {
  AUDIT_EVENTS: "audit.events",
  OBLIGATION_TRANSITIONS: "obligation.transitions",
  POLICY_DECISIONS: "policy.decisions",
  SESSION_KEY_REVOCATIONS: "session_key.revocations",
} as const;

/**
 * Idempotent Kafka producer factory.
 *
 * Each service instance gets a unique `transactional.id` for exactly-once
 * semantics. The producer is configured with idempotence enabled and
 * `acks: "all"`.
 */
export function createProducer(
  brokers: string[],
  clientId: string,
): Producer {
  const kafka = new Kafka({ brokers, clientId });
  return kafka.producer({
    idempotent: true,
    transactionalId: `${clientId}-${process.pid}`,
    maxInFlightRequests: 1,
    allowAutoTopicCreation: false,
  });
}

/**
 * Consumer factory with exactly-once semantics.
 *
 * Each consumer group id should be deterministic per service so that
 * rebalance restores from the last committed offset.
 */
export function createConsumer(
  brokers: string[],
  clientId: string,
  groupId: string,
): Consumer {
  const kafka = new Kafka({ brokers, clientId });
  return kafka.consumer({
    groupId,
    allowAutoTopicCreation: false,
    maxWaitTimeInMs: 5000,
    sessionTimeout: 30000,
  });
}

export type { EachMessagePayload };

@Global()
@Module({
  providers: [
    {
      provide: KAFKA_PRODUCER,
      useFactory: () => {
        const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
        return createProducer(brokers, "agentpay");
      },
    },
    {
      provide: KAFKA_CONSUMER,
      useFactory: () => {
        const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
        return createConsumer(brokers, "agentpay", "agentpay-consumer");
      },
    },
  ],
  exports: [KAFKA_PRODUCER, KAFKA_CONSUMER],
})
export class KafkaModule {}
