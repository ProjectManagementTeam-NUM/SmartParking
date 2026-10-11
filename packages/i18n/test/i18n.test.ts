import { describe, expect, it, vi } from "vitest";
import { initI18n, LANGUAGE_STORAGE_KEY, setLanguage } from "../src";

describe("initI18n", () => {
  it("defaults to Mongolian", () => {
    const i18n = initI18n();
    expect(i18n.language).toBe("mn");
    expect(i18n.t("parking.status.FULL")).toBe("Дүүрсэн");
  });

  it("interpolates the free count", () => {
    expect(initI18n().t("parking.free", { free: 4, total: 6 })).toBe("4/6 сул");
  });

  it("restores a stored language", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    expect(initI18n().t("parking.status.FULL")).toBe("Full");
  });

  it("ignores an unsupported stored language", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    expect(initI18n().language).toBe("mn");
  });

  it("falls back to Mongolian when storage access throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(initI18n().language).toBe("mn");
  });
});

describe("setLanguage", () => {
  it("switches language and persists it", async () => {
    const i18n = initI18n();
    await setLanguage(i18n, "en");
    expect(i18n.t("parking.free", { free: 4, total: 6 })).toBe("4/6 free");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });

  it("still switches language when storage writes throw", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const i18n = initI18n();
    await setLanguage(i18n, "en");
    expect(i18n.language).toBe("en");
  });
});
