import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { zipStream, type ZipEntry } from "@/lib/zip";
import { collect, readZip } from "./helpers/zip";

describe("zipStream", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-"));
  const photo = path.join(dir, "photo.bin");
  fs.writeFileSync(photo, Buffer.from(Array.from({ length: 300_000 }, (_, i) => i % 251)));

  const entries = (): ZipEntry[] => [
    { name: "index.html", data: "<h1>Über Porto</h1>" },
    { name: "media/1.webp", file: photo },
    { name: "empty.txt", data: "" },
  ];

  for (const force64 of [false, true]) {
    it(`writes entries that read back unchanged${force64 ? " (ZIP64)" : ""}`, async () => {
      const files = readZip(await collect(zipStream(entries(), { force64 })));
      expect([...files.keys()]).toEqual(["index.html", "media/1.webp", "empty.txt"]);
      expect(files.get("index.html")!.toString("utf8")).toBe("<h1>Über Porto</h1>");
      expect(files.get("media/1.webp")!.equals(fs.readFileSync(photo))).toBe(true);
      expect(files.get("empty.txt")!.length).toBe(0);
    });
  }

  it("takes entries from an async generator", async () => {
    async function* lazy() {
      yield { name: "a.txt", data: "a" } as ZipEntry;
      yield { name: "b.txt", data: "b" } as ZipEntry;
    }
    const files = readZip(await collect(zipStream(lazy())));
    expect(files.get("b.txt")!.toString()).toBe("b");
  });
});
