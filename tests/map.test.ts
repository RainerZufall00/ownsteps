import { describe, expect, it } from "vitest";
import { isMapAsset } from "@/lib/maptiler-rewrite";

describe("map proxy allowlist", () => {
  it("lets through what a MapTiler style loads", () => {
    for (const path of [
      "maps/streets-v2/style.json",
      "maps/streets-v2/sprite@2x.png",
      "tiles/v3/tiles.json",
      "tiles/v3/5/17/11.pbf",
      "fonts/Noto%20Sans%20Regular/0-255.pbf",
      "resources/logo.svg",
    ]) {
      expect(isMapAsset(path), path).toBe(true);
    }
  });

  it("keeps the key away from every other MapTiler API", () => {
    for (const path of [
      "geocoding/Lisbon.json",
      "data/abc/features.json",
      "maps/streets-v2/static/0,0,3/400x300.png",
      "maps/streets-v2/st%61tic/0,0,3/400x300.png",
      "coordinates/search/utm.json",
      "%E0%A4%A",
      "",
    ]) {
      expect(isMapAsset(path), path).toBe(false);
    }
  });

  it("is checked after dot segments are resolved", () => {
    const target = new URL("https://api.maptiler.com/maps/%2e%2e/geocoding/x.json");
    expect(isMapAsset(target.pathname.slice(1))).toBe(false);
  });
});
