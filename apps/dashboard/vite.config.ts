import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiTarget = process.env.API_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
      "/socket.io": { target: apiTarget, ws: true },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    // Node 25+ ships a built-in localStorage global that shadows jsdom's.
    poolOptions: { forks: { execArgv: ["--no-experimental-webstorage"] } },
  },
});
