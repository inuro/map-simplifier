import { describe, expect, it } from "vitest";
import { formatLatLng, parseLatLngInput } from "../../src/state/latLngInput";

describe("parseLatLngInput", () => {
  it("parses comma-separated latitude and longitude", () => {
    expect(parseLatLngInput("35.681, 139.767")).toEqual({
      lat: 35.681,
      lng: 139.767,
    });
  });

  it("accepts whitespace-separated coordinates", () => {
    expect(parseLatLngInput("35.681 139.767")).toEqual({
      lat: 35.681,
      lng: 139.767,
    });
  });

  it("accepts Japanese comma variants", () => {
    expect(parseLatLngInput("35.681、139.767")).toEqual({
      lat: 35.681,
      lng: 139.767,
    });
  });

  it("rejects malformed input", () => {
    expect(parseLatLngInput("35.681")).toBeNull();
    expect(parseLatLngInput("35.681,")).toBeNull();
    expect(parseLatLngInput("lat, lng")).toBeNull();
  });

  it("rejects out-of-range latitude or longitude", () => {
    expect(parseLatLngInput("91, 139.767")).toBeNull();
    expect(parseLatLngInput("35.681, 181")).toBeNull();
  });
});

describe("formatLatLng", () => {
  it("formats with five decimals by default", () => {
    expect(formatLatLng({ lat: 35.681236, lng: 139.767126 })).toBe(
      "35.68124, 139.76713",
    );
  });
});
