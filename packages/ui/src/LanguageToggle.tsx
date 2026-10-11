import { setLanguage, SUPPORTED_LANGUAGES } from "@smart-parking/i18n";
import { useTranslation } from "react-i18next";

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t("language.label")} className="inline-flex rounded-lg bg-white/15 p-0.5">
      {SUPPORTED_LANGUAGES.map((lng) => {
        const active = i18n.language === lng;
        return (
          <button
            key={lng}
            type="button"
            aria-pressed={active}
            onClick={() => void setLanguage(i18n, lng)}
            className={`rounded-md px-2 py-1 text-xs font-semibold ${active ? "bg-white text-brand" : "text-current"}`}
          >
            {t(`language.${lng}`)}
          </button>
        );
      })}
    </div>
  );
}
