import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nominatimPlace, photonName, reverseGeocode, searchPlaces } from "@/lib/geocode";

describe("place names without a MapTiler key", () => {
  beforeEach(() => {
    process.env.GEOCODING = "on";
  });
  afterEach(() => {
    process.env.GEOCODING = "off";
    vi.unstubAllGlobals();
  });

  it("names the town, not the district, from Nominatim's address", () => {
    expect(
      nominatimPlace({
        city_district: "Cedofeita, Santo Ildefonso, Sé",
        city: "Porto",
        county: "Porto",
        country: "Portugal",
        country_code: "pt",
      }),
    ).toEqual({ placeName: "Porto, Portugal", countryCode: "PT" });
    expect(nominatimPlace({ town: "Nazaré", country: "Portugal", country_code: "pt" }).placeName).toBe(
      "Nazaré, Portugal",
    );
  });

  it("tells places of the same name apart in the search", () => {
    expect(photonName({ name: "Nazaré", state: "Bahia", country: "Brasilien" })).toBe("Nazaré, Bahia, Brasilien");
    expect(photonName({ name: "Porto", city: "Porto", country: "Portugal" })).toBe("Porto, Portugal");
  });

  it("asks Photon and Nominatim with an identifying User-Agent, one at a time", async () => {
    const calls: { url: string; agent: string | null; at: number }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init: RequestInit = {}) => {
        const url = String(input);
        calls.push({ url, agent: new Headers(init.headers).get("user-agent"), at: Date.now() });
        if (url.startsWith("https://photon.komoot.io/api")) {
          return Response.json({
            features: [
              {
                geometry: { coordinates: [-9.07, 39.6] },
                properties: { osm_type: "N", osm_id: 1, name: "Nazaré", country: "Portugal" },
              },
            ],
          });
        }
        return Response.json({ address: { town: "Nazaré", country: "Portugal", country_code: "pt" } });
      }),
    );

    const hits = await searchPlaces("Naza", "de");
    expect(hits).toEqual([{ id: "N1", name: "Nazaré, Portugal", lon: -9.07, lat: 39.6 }]);
    expect(calls[0].url).toContain("lang=de");

    const [first, second] = await Promise.all([reverseGeocode(39.6, -9.07, "de"), reverseGeocode(39.61, -9.06, "de")]);
    expect(first).toEqual({ placeName: "Nazaré, Portugal", countryCode: "PT" });
    expect(second.placeName).toBe("Nazaré, Portugal");
    const nominatim = calls.filter((c) => c.url.startsWith("https://nominatim.openstreetmap.org/reverse"));
    expect(nominatim).toHaveLength(2);
    expect(nominatim[1].at - nominatim[0].at).toBeGreaterThanOrEqual(950);
    expect(nominatim[0].url).toContain("accept-language=de");
    for (const call of calls) expect(call.agent).toMatch(/^OwnSteps\//);
  });
});
