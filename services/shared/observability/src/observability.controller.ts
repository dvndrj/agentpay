import { Controller, Get, Header } from "@nestjs/common";
import { MetricsService } from "./metrics.service";

@Controller()
export class ObservabilityController {
  constructor(private readonly metricsService: MetricsService) {}

  /** Kubernetes liveness probe. */
  @Get("healthz")
  healthz(): { status: string } {
    return { status: "ok" };
  }

  /** Kubernetes readiness probe — can be extended to check DB/Redis/Kafka. */
  @Get("readyz")
  readyz(): { status: string } {
    return { status: "ok" };
  }

  /** Prometheus scrape endpoint. */
  @Get("metrics")
  @Header("Content-Type", "text/plain")
  async metrics(): Promise<string> {
    return this.metricsService.getMetricsText();
  }
}
