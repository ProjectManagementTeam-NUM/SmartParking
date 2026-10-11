import { ApiError, type ApiClient } from "@smart-parking/api-client";
import { ApiProvider } from "@smart-parking/api-client/react";
import { initI18n } from "@smart-parking/i18n";
import type { ParkingSummary } from "@smart-parking/shared";
import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

const parkings: ParkingSummary[] = [
  {
    id: "A",
    name: "Parking A",
    address: "x",
    lat: 0,
    lng: 0,
    freeCount: 4,
    totalCount: 6,
    status: "AVAILABLE",
  },
  {
    id: "B",
    name: "Parking B",
    address: "y",
    lat: 0,
    lng: 0,
    freeCount: 0,
    totalCount: 6,
    status: "FULL",
  },
];

function renderApp(getParkings: ApiClient["getParkings"]) {
  const client: ApiClient = { getParkings, getParking: vi.fn() };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={initI18n()}>
      <ApiProvider client={client} queryClient={queryClient}>
        <App />
      </ApiProvider>
    </I18nextProvider>,
  );
}

describe("Dashboard App", () => {
  it("shows the operator title and a card per site", async () => {
    renderApp(vi.fn().mockResolvedValue(parkings));
    expect(screen.getByRole("heading", { name: "Операторын самбар" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Зогсоолууд" })).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: "Parking B" })).toHaveTextContent("0/6 сул");
  });

  it("shows an error alert when the API is down", async () => {
    renderApp(vi.fn().mockRejectedValue(new ApiError(0, "Network error")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Мэдээлэл ачаалж чадсангүй");
  });
});
