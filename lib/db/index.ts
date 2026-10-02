import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * node-postgres works against both local Postgres (dev) and Neon (prod —
 * use the pooled connection string; migrations keep the direct one). Pool is
 * module-scoped so serverless invocations reuse connections within a warm
 * instance.
 *
 * Fluid Compute can suspend an instance with clients still idle in the pool,
 * and those connections then count against Neon until they time out.
 * attachDatabasePool keeps the instance alive just long enough for the pool's
 * idle timeout to close them. Outside Vercel — tests, builds, local dev — it
 * does nothing.
 */
const pool = new Pool({ connectionString: requireEnv("DATABASE_URL") });
attachDatabasePool(pool);

export const db = drizzle({ client: pool, schema });
