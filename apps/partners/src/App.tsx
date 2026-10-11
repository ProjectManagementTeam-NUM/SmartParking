import { useParkings } from "@smart-parking/api-client/react";
import { LanguageToggle, ParkingCard } from "@smart-parking/ui";
import { useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation();
  const parkings = useParkings();

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <nav className="flex items-center justify-between px-6 py-4">
        <span className="font-bold text-brand">{t("app.partnersTitle")}</span>
        <div className="text-brand">
          <LanguageToggle />
        </div>
      </nav>
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t("partners.heroTitle")}</h1>
        <p className="mt-4 text-lg text-slate-600">{t("partners.heroBody")}</p>
        <a
          href="#pilot"
          className="mt-8 inline-block rounded-lg bg-brand px-6 py-3 font-semibold text-white"
        >
          {t("partners.cta")}
        </a>
      </section>
      <section className="mx-auto max-w-3xl px-6 pb-16">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          {t("partners.liveTitle")}
        </h2>
        {parkings.isError && (
          <p role="alert" className="rounded-lg bg-occupied/10 p-3 text-occupied">
            {t("common.error")}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {parkings.data?.map((parking) => <ParkingCard key={parking.id} parking={parking} />)}
        </div>
      </section>
    </div>
  );
}
