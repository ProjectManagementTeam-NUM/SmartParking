import { useParkings } from "@smart-parking/api-client/react";
import { LanguageToggle, ParkingCard } from "@smart-parking/ui";
import { useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation();
  const parkings = useParkings();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between bg-brand px-4 py-3 text-white">
        <h1 className="text-lg font-semibold">{t("app.driverTitle")}</h1>
        <LanguageToggle />
      </header>
      <main className="mx-auto max-w-md space-y-3 p-4">
        {parkings.isPending && <p className="text-slate-500">{t("common.loading")}</p>}
        {parkings.isError && (
          <p role="alert" className="rounded-lg bg-occupied/10 p-3 text-occupied">
            {t("common.error")}
          </p>
        )}
        {parkings.data?.map((parking) => <ParkingCard key={parking.id} parking={parking} />)}
      </main>
    </div>
  );
}
