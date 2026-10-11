import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./test-db";

// Applies migrations to the test database (non-destructive; seed() wipes data per test).
export default function setup(): void {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
