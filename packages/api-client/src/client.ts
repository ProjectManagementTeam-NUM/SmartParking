import { ParkingDetail, ParkingSummary } from "@smart-parking/shared";
import { z } from "zod";

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiClient {
  getParkings(): Promise<ParkingSummary[]>;
  getParking(id: string): Promise<ParkingDetail>;
}

export interface ApiClientOptions {
  /** "" (default) = same origin, which is what the Vite proxy and Caddy expect. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export function createApiClient({
  baseUrl = "",
  fetchFn = globalThis.fetch.bind(globalThis),
}: ApiClientOptions = {}): ApiClient {
  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, { headers: { Accept: "application/json" } });
    } catch (error) {
      throw new ApiError(0, `Network error: ${(error as Error).message}`);
    }
    if (!response.ok) throw new ApiError(response.status, `Request failed: ${response.status}`);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiError(response.status, "Invalid JSON response");
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(response.status, "Unexpected response shape");
    return parsed.data;
  }

  return {
    getParkings: () => get("/api/parkings", z.array(ParkingSummary)),
    getParking: (id) => get(`/api/parkings/${encodeURIComponent(id)}`, ParkingDetail),
  };
}
