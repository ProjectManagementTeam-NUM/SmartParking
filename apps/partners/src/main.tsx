import { createApiClient, createRealtime } from "@smart-parking/api-client";
import { ApiProvider } from "@smart-parking/api-client/react";
import { initI18n } from "@smart-parking/i18n";
import { QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { App } from "./App";
import "./index.css";

const i18n = initI18n();
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <ApiProvider client={createApiClient()} queryClient={queryClient} socket={createRealtime()}>
        <App />
      </ApiProvider>
    </I18nextProvider>
  </StrictMode>,
);
