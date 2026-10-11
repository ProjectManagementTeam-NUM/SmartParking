import type { ParkingSummary } from "@smart-parking/shared";

export function formatStatus(parkings: ParkingSummary[]): string {
  if (parkings.length === 0) return "No parkings found (did you run npm run db:seed?)";
  return parkings
    .map(
      (p) =>
        `${p.id.padEnd(3)}${p.name.padEnd(12)}${`${p.freeCount}/${p.totalCount}`.padEnd(7)}${p.status}`,
    )
    .join("\n");
}
