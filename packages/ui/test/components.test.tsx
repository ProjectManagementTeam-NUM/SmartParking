import { initI18n } from "@smart-parking/i18n";
import type { ParkingSummary } from "@smart-parking/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { LanguageToggle, ParkingCard, StatusPill } from "../src";

const parkingA: ParkingSummary = {
  id: "A",
  name: "Parking A",
  address: "Sukhbaatar Square",
  lat: 0,
  lng: 0,
  freeCount: 4,
  totalCount: 6,
  status: "AVAILABLE",
};

function withI18n(ui: ReactNode) {
  return render(<I18nextProvider i18n={initI18n()}>{ui}</I18nextProvider>);
}

describe("StatusPill", () => {
  it("labels FULL in Mongolian and exposes the status", () => {
    withI18n(<StatusPill status="FULL" />);
    expect(screen.getByText("Дүүрсэн")).toHaveAttribute("data-status", "FULL");
  });
});

describe("ParkingCard", () => {
  it("shows name, address, free count and status", () => {
    withI18n(<ParkingCard parking={parkingA} />);
    const card = screen.getByRole("article", { name: "Parking A" });
    expect(card).toHaveTextContent("Sukhbaatar Square");
    expect(card).toHaveTextContent("4/6 сул");
    expect(card).toHaveTextContent("Сул байртай");
  });
});

describe("LanguageToggle", () => {
  it("switches every label to English and marks EN as pressed", async () => {
    withI18n(
      <>
        <LanguageToggle />
        <ParkingCard parking={parkingA} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(await screen.findByText("4/6 free")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "МН" })).toHaveAttribute("aria-pressed", "false");
  });
});
