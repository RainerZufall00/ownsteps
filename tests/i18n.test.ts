import { describe, expect, it } from "vitest";
import { formatRange, formatWeekday } from "@/lib/format";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { negotiateLocale, resolveLocale } from "@/lib/i18n/locales";
import { fill, plural } from "@/lib/i18n/text";

describe("picking the UI language", () => {
  it("defaults to English", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("")).toBe("en");
    expect(negotiateLocale("fr-FR,fr;q=0.9")).toBe("en");
  });

  it("follows Accept-Language by quality, ignoring regions", () => {
    expect(negotiateLocale("de-AT,de;q=0.9,en;q=0.8")).toBe("de");
    expect(negotiateLocale("fr;q=1,de;q=0.5,en;q=0.7")).toBe("en");
    expect(negotiateLocale("fr, de")).toBe("de");
    expect(negotiateLocale("de;q=0, en-GB")).toBe("en");
  });

  it("lets the switch's cookie win, but not an unknown value", () => {
    expect(resolveLocale("de", "en-US")).toBe("de");
    expect(resolveLocale("en", "de-DE")).toBe("en");
    expect(resolveLocale("xx", "de-DE")).toBe("de");
  });
});

/** Every leaf as "path → text", for comparing the two dictionaries. */
function leaves(value: unknown, path = ""): Map<string, string> {
  const result = new Map<string, string>();
  if (typeof value === "string") {
    result.set(path, value);
    return result;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    for (const [p, text] of leaves(child, path ? `${path}.${key}` : key)) result.set(p, text);
  }
  return result;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("dictionaries", () => {
  const en = leaves(DICTIONARIES.en);
  const de = leaves(DICTIONARIES.de);

  it("have the same keys", () => {
    expect([...de.keys()].sort()).toEqual([...en.keys()].sort());
  });

  it("use the same placeholders", () => {
    for (const [path, text] of en) {
      expect(placeholders(de.get(path) ?? ""), path).toEqual(placeholders(text));
    }
  });
});

describe("text helpers", () => {
  it("fills placeholders and plurals", () => {
    expect(fill("Day {day}", { day: 3 })).toBe("Day 3");
    expect(plural(DICTIONARIES.en.counts.steps, 1)).toBe("1 step");
    expect(plural(DICTIONARIES.en.counts.steps, 4)).toBe("4 steps");
    expect(plural(DICTIONARIES.de.counts.photos, 0)).toBe("0 Fotos");
  });
});

describe("dates per language", () => {
  const july1 = new Date(2026, 6, 1).getTime();
  const july20 = new Date(2026, 6, 20).getTime();
  const aug3 = new Date(2026, 7, 3).getTime();

  it("formats ranges the local way", () => {
    expect(formatRange(july1, july20, "en")).toBe("July 1–20, 2026");
    expect(formatRange(july1, july20, "de")).toBe("1.–20. Juli 2026");
    expect(formatRange(july1, aug3, "en")).toBe("Jul 1 – Aug 3, 2026");
    expect(formatRange(july1, aug3, "de")).toBe("1. Juli – 3. Aug. 2026");
    expect(formatRange(null, null, "en")).toBeNull();
  });

  it("names the weekday", () => {
    expect(formatWeekday(july1, "en")).toBe("Wednesday, July 1");
    expect(formatWeekday(july1, "de")).toBe("Mittwoch, 1. Juli");
  });
});
