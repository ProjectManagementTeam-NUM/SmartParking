import { useParkings } from "@smart-parking/api-client/react";
import { LanguageToggle, ParkingCard } from "@smart-parking/ui";
import { useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation();
  const parkings = useParkings();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between bg-brand px-6 py-3 text-white">
        <h1 className="text-lg font-semibold">{t("app.dashboardTitle")}</h1>
        <LanguageToggle />
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          {t("dashboard.sites")}
        </h2>
        {parkings.isPending && <p className="text-slate-500">{t("common.loading")}</p>}
        {parkings.isError && (
          <p role="alert" className="rounded-lg bg-occupied/10 p-3 text-occupied">
            {t("common.error")}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {parkings.data?.map((parking) => (
            <ParkingCard key={parking.id} parking={parking} />
          ))}
        </div>
      </main>
    </div>
  );
}
