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
  },
});
