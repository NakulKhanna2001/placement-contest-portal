import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.{ts,tsx}"], fileParallelism: false, testTimeout: 30000 },
  resolve: { alias: { "@": path.resolve("src") } },
});
