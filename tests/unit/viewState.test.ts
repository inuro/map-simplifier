import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, encodeViewToHash, decodeHashToView } from "../../src/state/viewState";

describe("viewState hash encoding", () => {
  it("default view is Tokyo-ish at zoom 13", () => {
    expect(DEFAULT_VIEW.center.lng).toBeCloseTo(139.767, 3);
    expect(DEFAULT_VIEW.center.lat).toBeCloseTo(35.681, 3);
    expect(DEFAULT_VIEW.zoom).toBe(13);
  });

  it("roundtrips a view through hash encode/decode", () => {
    const view = { center: { lng: 135.5023, lat: 34.6937 }, zoom: 15 };
    const hash = encodeViewToHash(view);
    expect(hash.startsWith("#")).toBe(true);
    const parsed = decodeHashToView(hash);
    expect(parsed).not.toBeNull();
    expect(parsed!.center.lng).toBeCloseTo(135.5023, 4);
    expect(parsed!.center.lat).toBeCloseTo(34.6937, 4);
    expect(parsed!.zoom).toBeCloseTo(15, 2);
  });

  it("returns null for malformed hashes", () => {
    expect(decodeHashToView("")).toBeNull();
    expect(decodeHashToView("#garbage")).toBeNull();
    expect(decodeHashToView("#12/abc/def")).toBeNull();
  });
});
