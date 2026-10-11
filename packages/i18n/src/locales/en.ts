import type { mn } from "./mn";

// Typed as `typeof mn`, so a missing or extra key is a compile error.
export const en: typeof mn = {
  app: {
    driverTitle: "Find free parking",
    dashboardTitle: "Operator dashboard",
    partnersTitle: "Smart Parking",
  },
  common: {
    loading: "Loading…",
    error: "Could not load data",
  },
  parking: {
    free: "{{free}}/{{total}} free",
    status: {
      AVAILABLE: "Available",
      FULL: "Full",
    },
  },
  language: {
    label: "Language",
    mn: "МН",
    en: "EN",
  },
  dashboard: {
    sites: "Sites",
  },
  partners: {
    heroTitle: "Make your parking smart",
    heroBody: "Deliver real-time free-space information to drivers.",
    cta: "Request a pilot",
    liveTitle: "Right now",
  },
};
