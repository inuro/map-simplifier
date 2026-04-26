import { describe, expect, it, vi } from "vitest";
import { reverseGeocodeGsi, suggestSnapshotLabel } from "../../src/state/reverseGeocode";

describe("reverseGeocodeGsi", () => {
  it("returns lv01Nm from GSI reverse geocoder response", async () => {
    let capturedUrl: URL | null = null;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = new URL(String(input));
      return new Response(JSON.stringify({ results: { muniCd: "01101", lv01Nm: "大通西一丁目" } }));
    });

    await expect(
      reverseGeocodeGsi({ lat: 43.061, lng: 141.356 }, fetchImpl as unknown as typeof fetch),
    ).resolves.toBe("大通西一丁目");

    expect(capturedUrl).not.toBeNull();
    const url = capturedUrl as unknown as URL;
    expect(url.searchParams.get("lat")).toBe("43.061");
    expect(url.searchParams.get("lon")).toBe("141.356");
  });

  it("falls back to coordinates when label lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(
      suggestSnapshotLabel(
        { lat: 43.06619, lng: 141.35299 },
        16.35,
        new Date("2026-04-25T12:34:00"),
      ),
    ).resolves.toBe("43.066, 141.353 Z16.35 2026-04-25_1234");

    vi.unstubAllGlobals();
  });
});
