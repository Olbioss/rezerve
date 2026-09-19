import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./lib/test/empty.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    setupFiles: ["./lib/test/setup.ts"],
    /**
     * Run test files one at a time. The integration suites all talk to the
     * same Postgres, each opening its own pool and closing it in afterAll, so
     * running files in parallel makes them contend and fail intermittently —
     * never reproducibly, and never when a file runs alone.
     *
     * Tests within a file still run in order as usual; only cross-file
     * parallelism is off.
     */
    fileParallelism: false,
  },
});
