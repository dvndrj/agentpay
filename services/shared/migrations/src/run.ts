/**
 * Kysely migration runner for AgentPay.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --filter @agentpay/migrations migrate:up
 *   DATABASE_URL=postgres://... pnpm --filter @agentpay/migrations migrate:down
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import { Migrator } from "kysely/migration";
import { up as migration0001Up, down as migration0001Down } from "./0001_initial.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: dbUrl }),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: {
      async getMigrations() {
        return {
          "0001_initial": {
            up: migration0001Up,
            down: migration0001Down,
          },
        };
      },
    },
  });

  const direction = process.argv[2];
  if (direction === "down") {
    const { error } = await migrator.migrateDown();
    if (error) {
      console.error("Migration down failed:", error);
      process.exit(1);
    }
    console.log("Migration down applied.");
  } else {
    const { error, results } = await migrator.migrateToLatest();
    if (error) {
      console.error("Migration failed:", error);
      process.exit(1);
    }
    if (results && results.length > 0) {
      console.log(
        "Migrations applied:",
        results.map((r: { migrationName: string; status: string }) => `${r.migrationName}: ${r.status}`).join(", "),
      );
    } else {
      console.log("No pending migrations.");
    }
  }

  await db.destroy();
}

void main();
