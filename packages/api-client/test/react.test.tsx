import type { ParkingSummary } from "@smart-parking/shared";
import { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient, RealtimeSocket } from "../src";
import { ApiProvider, useParkings } from "../src/react";

const parkingB: ParkingSummary = {
  id: "B",
  name: "Parking B",
  address: "x",
  lat: 0,
  lng: 0,
  freeCount: 1,
  totalCount: 6,
  status: "AVAILABLE",
};

function fakeSocket() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const socket = {
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return socket;
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      handlers.get(event)?.delete(handler);
      return socket;
    },
    fire(event: string, ...args: unknown[]) {
      handlers.get(event)?.forEach((handler) => handler(...args));
    },
  };
  return socket;
}

function setup() {
  const client: ApiClient = {
    getParkings: vi.fn().mockResolvedValue([parkingB]),
    getParking: vi.fn(),
  };
  const socket = fakeSocket();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider
      client={client}
      queryClient={queryClient}
      socket={socket as unknown as RealtimeSocket}
    >
      {children}
    </ApiProvider>
  );
  return { client, socket, wrapper };
}

describe("useParkings", () => {
  it("loads parkings through the client", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useParkings(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([parkingB]));
  });

  it("refetches when the server pushes parking.updated", async () => {
    const { client, socket, wrapper } = setup();
    const { result } = renderHook(() => useParkings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    socket.fire("parking.updated", { id: "B", freeCount: 0, status: "FULL" });

    await waitFor(() => expect(client.getParkings).toHaveBeenCalledTimes(2));
  });

  it("refetches after the socket reconnects", async () => {
    const { client, socket, wrapper } = setup();
    const { result } = renderHook(() => useParkings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    socket.fire("connect");

    await waitFor(() => expect(client.getParkings).toHaveBeenCalledTimes(2));
  });
});
