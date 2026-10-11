import type { ParkingSummary } from "@smart-parking/shared";
import { useTranslation } from "react-i18next";
import { StatusPill } from "./StatusPill";

export function ParkingCard({ parking }: { parking: ParkingSummary }) {
  const { t } = useTranslation();
  return (
    <article
      aria-label={parking.name}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{parking.name}</h2>
          <p className="text-sm text-slate-500">{parking.address}</p>
        </div>
        <StatusPill status={parking.status} />
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">
        {t("parking.free", { free: parking.freeCount, total: parking.totalCount })}
      </p>
    </article>
  );
}
