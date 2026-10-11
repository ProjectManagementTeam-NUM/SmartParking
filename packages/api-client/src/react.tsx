import { SOCKET_EVENTS } from "@smart-parking/shared";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { ApiClient } from "./client";
import type { RealtimeSocket } from "./realtime";

export const queryKeys = {
  parkings: ["parkings"] as const,
  parking: (id: string) => ["parkings", id] as const,
};

const ApiClientContext = createContext<ApiClient | null>(null);

export interface ApiProviderProps {
  client: ApiClient;
  queryClient: QueryClient;
  socket?: RealtimeSocket;
  children: ReactNode;
}

export function ApiProvider({ client, queryClient, socket, children }: ApiProviderProps) {
  useEffect(() => {
    if (!socket) return;
    // Server push = "something changed": refetch instead of patching caches by hand.
    // On (re)connect we may have missed events, so refetch too.
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.parkings });
    };
    socket.on(SOCKET_EVENTS.parkingUpdated, refresh);
    socket.on("connect", refresh);
    return () => {
      socket.off(SOCKET_EVENTS.parkingUpdated, refresh);
      socket.off("connect", refresh);
    };
  }, [socket, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>
    </QueryClientProvider>
  );
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error("useApiClient must be used inside <ApiProvider>");
  return client;
}

export function useParkings() {
  const client = useApiClient();
  return useQuery({ queryKey: queryKeys.parkings, queryFn: () => client.getParkings() });
}
