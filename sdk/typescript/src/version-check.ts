import type { AgentPayClient } from "./client";

/** The range of API versions this SDK supports. */
const SUPPORTED_VERSION_RANGE = "^0";

let versionChecked = false;

/**
 * Check the AgentPay API version on the first SDK call (R11.4).
 *
 * Fetches GET /v1/meta/version. If the version is outside the supported
 * range, emits a single `console.warn` and continues.
 */
export async function checkApiVersion(client: AgentPayClient): Promise<void> {
  if (versionChecked) return;
  versionChecked = true;

  try {
    const { version } = await client.get<{ version: string }>("/v1/meta/version");

    // Simple semver major-version check: warn if major differs from supported range
    const major = parseInt(version.split(".")[0] ?? "0", 10);
    const supportedMajor = parseInt(
      SUPPORTED_VERSION_RANGE.replace("^", ""),
      10,
    );

    if (major !== supportedMajor) {
      console.warn(
        `[AgentPay SDK] API version ${version} is outside the supported range ` +
          `${SUPPORTED_VERSION_RANGE}.x. Some features may not work correctly. ` +
          `Please update @agentpay/sdk to match the server version.`,
      );
    }
  } catch {
    // Version endpoint is optional — fail silently
  }
}
