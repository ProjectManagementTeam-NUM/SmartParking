import { createApiClient } from "@smart-parking/api-client";
import { formatStatus } from "./format";

const baseUrl = process.env.API_URL ?? "http://localhost:3000";
const [command = "status"] = process.argv.slice(2);

if (command === "status") {
  try {
    const parkings = await createApiClient({ baseUrl }).getParkings();
    console.log(formatStatus(parkings));
  } catch (error) {
    console.error(`Cannot reach API at ${baseUrl}: ${(error as Error).message}`);
    process.exit(1);
  }
} else {
  console.error(`Unknown command "${command}". Available: status`);
  process.exit(1);
}
