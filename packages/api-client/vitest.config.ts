import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    // Node 25+ ships a built-in localStorage global that shadows jsdom's.
    poolOptions: { forks: { execArgv: ["--no-experimental-webstorage"] } },
  },
});
