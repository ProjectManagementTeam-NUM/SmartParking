import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "../src";

const parkingA = {
  id: "A",
  name: "Parking A",
  address: "x",
  lat: 0,
  lng: 0,
  freeCount: 4,
  totalCount: 6,
  status: "AVAILABLE",
};

function fetchReturning(response: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}

describe("createApiClient", () => {
  it("parses a valid parkings response", async () => {
    const fetchFn = fetchReturning(Response.json([parkingA]));
    const client = createApiClient({ baseUrl: "http://api", fetchFn });
    await expect(client.getParkings()).resolves.toEqual([parkingA]);
    expect(fetchFn).toHaveBeenCalledWith("http://api/api/parkings", expect.anything());
  });

  it("URL-encodes the parking id", async () => {
    const fetchFn = fetchReturning(Response.json({ ...parkingA, slots: [], gate: null }));
    await createApiClient({ fetchFn }).getParking("A/../x");
    expect(fetchFn).toHaveBeenCalledWith("/api/parkings/A%2F..%2Fx", expect.anything());
  });

  it("throws ApiError with the status for an HTML 502 from a proxy", async () => {
    const fetchFn = fetchReturning(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const error = await createApiClient({ fetchFn }).getParkings().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
  });

  it("throws ApiError when a 200 response is not JSON", async () => {
    const fetchFn = fetchReturning(new Response("<html></html>", { status: 200 }));
    await expect(createApiClient({ fetchFn }).getParkings()).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError when the response shape is wrong", async () => {
    const fetchFn = fetchReturning(Response.json([{ id: "A" }]));
    await expect(createApiClient({ fetchFn }).getParkings()).rejects.toThrow("Unexpected response shape");
  });

  it("throws ApiError with status 0 when the network fails", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await createApiClient({ fetchFn }).getParkings().catch((e: unknown) => e);
    expect((error as ApiError).status).toBe(0);
  });
});
