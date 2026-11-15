/**
 * Serializes state-changing work (ingest, operator override, offline monitor) in this process,
 * including the bus emissions after each commit. Without it, two writers to one parking can
 * commit in one order and publish in the other, leaving gates on a stale `parking.updated`.
 * Database row locks (see `applySlotChanges`) keep the data itself correct across processes.
 */
let tail: Promise<unknown> = Promise.resolve();

export function withWriteLock<T>(work: () => Promise<T>): Promise<T> {
  const run = tail.then(work, work);
  tail = run.catch(() => undefined);
  return run;
}
