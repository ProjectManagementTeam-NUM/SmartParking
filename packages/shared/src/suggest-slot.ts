import type { Slot } from "./models";

/**
 * Which free slot the driver app highlights (journey step 4, "Guidance").
 * Current rule: the lowest-numbered free slot. Change the rule here only.
 */
export function suggestSlot(
  slots: ReadonlyArray<Pick<Slot, "id" | "label" | "state">>,
): string | null {
  const free = slots
    .filter((slot) => slot.state === "FREE")
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return free[0]?.id ?? null;
}
