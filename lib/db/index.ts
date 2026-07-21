import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * node-postgres works against both local Postgres (dev) and Neon (prod —
 * use the pooled connection string). Pool is module-scoped so serverless
 * invocations reuse connections within a warm instance.
 */
const pool = new Pool({ connectionString: requireEnv("DATABASE_URL") });

export const db = drizzle({ client: pool, schema });
