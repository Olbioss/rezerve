import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { withVerifiedTls } from "./lib/db/connection-string";

export default defineConfig({
  schema: "./lib/db/schema",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: withVerifiedTls(process.env.DATABASE_URL!) },
});
