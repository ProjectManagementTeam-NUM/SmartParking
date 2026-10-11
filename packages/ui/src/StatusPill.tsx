import type { ParkingStatus } from "@smart-parking/shared";
import { useTranslation } from "react-i18next";

const styles: Record<ParkingStatus, string> = {
  AVAILABLE: "bg-free/15 text-free",
  FULL: "bg-occupied/15 text-occupied",
};

export function StatusPill({ status }: { status: ParkingStatus }) {
  const { t } = useTranslation();
  return (
    <span
      data-status={status}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${styles[status]}`}
    >
      {t(`parking.status.${status}`)}
    </span>
  );
}
