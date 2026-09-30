import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { UPLOAD_DIR } from "@/db";
import {
  deletePhotoFiles,
  photoDir,
  processUpload,
  processVideo,
  variantPath,
  videoPath,
} from "@/lib/images";
import { makeJpeg } from "./helpers/exif";

describe("processUpload", () => {
  it("writes all three web variants plus the original", async () => {
    const meta = await processUpload(await makeJpeg(3000, 2000));

    for (const [variant, width] of [
      ["thumb", 480],
      ["medium", 1280],
      ["large", 2400],
    ] as const) {
      const file = variantPath(meta.storageKey, variant);
      const info = await sharp(file).metadata();
      expect(info.format).toBe("webp");
      expect(info.width).toBe(width);
    }
    expect(fs.existsSync(path.join(photoDir(meta.storageKey), "original"))).toBe(true);
    expect(meta.width).toBe(3000);
    expect(meta.height).toBe(2000);
    expect(meta.bytes).toBeGreaterThan(0);
    expect(meta.placeholder).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("never enlarges small images", async () => {
    const meta = await processUpload(await makeJpeg(300, 200));
    const large = await sharp(variantPath(meta.storageKey, "large")).metadata();
    expect(large.width).toBe(300);
  });

  it("reads GPS position and capture time from EXIF", async () => {
    const meta = await processUpload(
      await makeJpeg(400, 300, {
        lat: 60.39299,
        lon: 5.32415,
        dateTimeOriginal: "2025:07:01 12:30:00",
      }),
    );
    expect(meta.lat).toBeCloseTo(60.39299, 4);
    expect(meta.lon).toBeCloseTo(5.32415, 4);
    // Read in the server's time zone, like the camera wrote it ([E12]).
    expect(meta.takenAt).toBe(new Date(2025, 6, 1, 12, 30, 0).getTime());
  });

  it("handles southern and western hemispheres", async () => {
    const meta = await processUpload(
      await makeJpeg(400, 300, { lat: -33.8568, lon: -70.6483 }),
    );
    expect(meta.lat).toBeCloseTo(-33.8568, 4);
    expect(meta.lon).toBeCloseTo(-70.6483, 4);
  });

  it("returns nulls for images without EXIF", async () => {
    const meta = await processUpload(await makeJpeg(400, 300));
    expect(meta.lat).toBeNull();
    expect(meta.lon).toBeNull();
    expect(meta.takenAt).toBeNull();
  });

  it("treats 0/0 as a placeholder, not a place", async () => {
    const meta = await processUpload(await makeJpeg(400, 300, { lat: 0, lon: 0 }));
    expect(meta.lat).toBeNull();
    expect(meta.lon).toBeNull();
  });

  it("ignores obviously broken camera clocks", async () => {
    const meta = await processUpload(
      await makeJpeg(400, 300, { dateTimeOriginal: "1980:01:01 00:00:00" }),
    );
    expect(meta.takenAt).toBeNull();
  });

  it("swaps width and height for rotated portrait photos", async () => {
    // Orientation 6: stored landscape, displayed rotated by 90°.
    const meta = await processUpload(
      await makeJpeg(400, 200, { orientation: 6 }),
    );
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(400);
    const medium = await sharp(variantPath(meta.storageKey, "medium")).metadata();
    expect(medium.width).toBe(200);
    expect(medium.height).toBe(400);
  });

  it("rejects files that aren't images and leaves nothing behind", async () => {
    const before = fs.readdirSync(UPLOAD_DIR).length;
    await expect(processUpload(Buffer.from("definitely not an image"))).rejects.toThrow();
    expect(fs.readdirSync(UPLOAD_DIR).length).toBe(before);
  });
});

describe("processVideo", () => {
  it("stores the video next to the poster frame's variants", async () => {
    const video = Buffer.from("fake mp4 payload");
    const meta = await processVideo(video, await makeJpeg(1280, 720));

    expect(fs.readFileSync(videoPath(meta.storageKey)).equals(video)).toBe(true);
    expect(fs.existsSync(variantPath(meta.storageKey, "medium"))).toBe(true);
    expect(meta.width).toBe(1280);
    expect(meta.bytes).toBeGreaterThan(video.byteLength);
  });

  it("leaves nothing behind when the poster frame is broken", async () => {
    const before = fs.readdirSync(UPLOAD_DIR).length;
    await expect(
      processVideo(Buffer.from("video"), Buffer.from("broken poster")),
    ).rejects.toThrow();
    expect(fs.readdirSync(UPLOAD_DIR).length).toBe(before);
  });
});

describe("deletePhotoFiles", () => {
  it("removes the whole storage folder", async () => {
    const meta = await processUpload(await makeJpeg(400, 300));
    await deletePhotoFiles(meta.storageKey);
    expect(fs.existsSync(photoDir(meta.storageKey))).toBe(false);
  });
});
