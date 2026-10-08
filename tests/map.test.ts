import { afterEach, describe, expect, it, vi } from "vitest";
import { isMapAsset, sanitizeAttribution, sanitizeAttributions } from "@/lib/maptiler-rewrite";

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

describe("attribution sanitizing", () => {
  it("keeps MapTiler's real attribution as it is", () => {
    const real =
      '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> ' +
      '<a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>';
    expect(sanitizeAttribution(real)).toBe(
      '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">&copy; MapTiler</a> ' +
        '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap contributors</a>',
    );
  });

  it("defuses the advisory's payload and other tricks", () => {
    for (const payload of [
      '<details open onload="1" ontoggle="alert(1)">x</details>',
      '<img src=x onerror="alert(1)">',
      '<a href="javascript:alert(1)">click</a>',
      '<a href="https://ok.example" onclick="alert(1)">ok</a>',
      "<<b>script>alert(1)<</b>/script>",
      "<svg/onload=alert(1)",
    ]) {
      const clean = sanitizeAttribution(payload);
      expect(clean, payload).not.toMatch(/<(?!a href="https:\/\/[^"]*" target="_blank" rel="noopener">|\/a>)/);
      expect(clean, payload).not.toMatch(/on\w+=|javascript:/i);
    }
  });

  it("cleans every attribution in a style and leaves the rest untouched", () => {
    const style = JSON.stringify({
      version: 8,
      sources: {
        tiles: { type: "vector", url: "https://x.example/tiles/{z}/{x}/{y}.pbf", attribution: '<img src=x onerror="alert(1)">Map' },
      },
      glyphs: "https://x.example/fonts/{fontstack}/{range}.pbf",
    });
    const clean = JSON.parse(sanitizeAttributions(style));
    expect(clean.sources.tiles.attribution).toBe("Map");
    expect(clean.glyphs).toBe("https://x.example/fonts/{fontstack}/{range}.pbf");
    expect(sanitizeAttributions("not json")).toBe("not json");
  });
});

describe("OpenFreeMap without a key", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("only proxies styles and TileJSON", async () => {
    const { isOpenFreeMapJson } = await import("@/lib/maptiler-rewrite");
    for (const path of ["styles/liberty", "planet", "natural_earth"]) expect(isOpenFreeMapJson(path), path).toBe(true);
    for (const path of ["planet/20261004/1/2/3.pbf", "fonts/Noto/0-255.pbf", "../etc", "styles/../x", ""]) {
      expect(isOpenFreeMapJson(path), path).toBe(false);
    }
  });

  it("serves the style with TileJSON pointed back at the proxy and attributions cleaned", async () => {
    const style = {
      sources: {
        openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
        shaded: { type: "raster", tiles: ["https://tiles.openfreemap.org/natural_earth/{z}/{x}/{y}.png"] },
      },
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    };
    const tilejson = {
      tiles: ["https://tiles.openfreemap.org/planet/2026/{z}/{x}/{y}.pbf"],
      attribution: '<a href="https://openfreemap.org">OpenFreeMap</a><img src=x onerror=alert(1)>',
    };
    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        fetched.push(String(input));
        return Response.json(String(input).endsWith("/planet") ? tilejson : style);
      }),
    );
    const { GET } = await import("@/app/api/map/[...path]/route");

    const styleResponse = await GET(new Request("http://localhost:2555/api/map/ofm/styles/liberty"));
    const served = await styleResponse.json();
    expect(served.sources.openmaptiles.url).toBe("http://localhost:2555/api/map/ofm/planet");
    // Tiles and fonts stay direct.
    expect(served.sources.shaded.tiles[0]).toBe("https://tiles.openfreemap.org/natural_earth/{z}/{x}/{y}.png");
    expect(served.glyphs).toBe(style.glyphs);

    const tileResponse = await GET(new Request("http://localhost:2555/api/map/ofm/planet"));
    const cleaned = await tileResponse.json();
    expect(cleaned.attribution).not.toContain("onerror");
    expect(cleaned.attribution).toContain("OpenFreeMap");
    expect(fetched).toEqual(["https://tiles.openfreemap.org/styles/liberty", "https://tiles.openfreemap.org/planet"]);

    const refused = await GET(new Request("http://localhost:2555/api/map/ofm/planet/1/2/3.pbf"));
    expect(refused.status).toBe(400);
  });
});
