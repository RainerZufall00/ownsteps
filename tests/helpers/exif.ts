import sharp from "sharp";

/**
 * Builds JPEGs with hand-made EXIF data. sharp can't write GPS tags, and a
 * real camera file in the repo would be large and say little about what it
 * contains – this way every test states exactly what the image carries.
 */

type Entry = { tag: number; type: number; count: number; value: Buffer };

const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

function ascii(text: string): Entry["value"] {
  return Buffer.from(`${text}\0`, "latin1");
}

function short(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function long(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

/** Degrees as three rationals (degrees, minutes, seconds × 1000). */
function dms(decimal: number) {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60 * 1000);
  const buffer = Buffer.alloc(24);
  [degrees, 1, minutes, 1, seconds, 1000].forEach((part, index) =>
    buffer.writeUInt32LE(part, index * 4),
  );
  return buffer;
}

/** Size of an IFD including its out-of-line data. */
function ifdSize(entries: Entry[]) {
  const data = entries
    .filter((entry) => entry.value.length > 4)
    .reduce((sum, entry) => sum + entry.value.length, 0);
  return 2 + entries.length * 12 + 4 + data;
}

/** Serializes one IFD that starts at `offset` within the TIFF block. */
function writeIfd(entries: Entry[], offset: number) {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  const head = Buffer.alloc(2 + sorted.length * 12 + 4);
  const data: Buffer[] = [];
  let dataOffset = offset + head.length;

  head.writeUInt16LE(sorted.length, 0);
  sorted.forEach((entry, index) => {
    const at = 2 + index * 12;
    head.writeUInt16LE(entry.tag, at);
    head.writeUInt16LE(entry.type, at + 2);
    head.writeUInt32LE(entry.count, at + 4);
    if (entry.value.length <= 4) {
      entry.value.copy(head, at + 8);
    } else {
      head.writeUInt32LE(dataOffset, at + 8);
      data.push(entry.value);
      dataOffset += entry.value.length;
    }
  });
  // Next-IFD offset stays 0: no thumbnail IFD.
  return Buffer.concat([head, ...data]);
}

type ExifSpec = {
  lat?: number;
  lon?: number;
  /** "YYYY:MM:DD HH:MM:SS", as cameras write it. */
  dateTimeOriginal?: string;
  orientation?: number;
};

function buildTiff(spec: ExifSpec) {
  const exifEntries: Entry[] = spec.dateTimeOriginal
    ? [
        {
          tag: 0x9003,
          type: ASCII,
          count: spec.dateTimeOriginal.length + 1,
          value: ascii(spec.dateTimeOriginal),
        },
      ]
    : [];

  const gpsEntries: Entry[] =
    spec.lat !== undefined && spec.lon !== undefined
      ? [
          { tag: 0x0001, type: ASCII, count: 2, value: ascii(spec.lat < 0 ? "S" : "N") },
          { tag: 0x0002, type: RATIONAL, count: 3, value: dms(spec.lat) },
          { tag: 0x0003, type: ASCII, count: 2, value: ascii(spec.lon < 0 ? "W" : "E") },
          { tag: 0x0004, type: RATIONAL, count: 3, value: dms(spec.lon) },
        ]
      : [];

  // IFD0 only holds inline values, so its size is known before the pointers.
  const ifd0Count =
    (spec.orientation ? 1 : 0) +
    (exifEntries.length ? 1 : 0) +
    (gpsEntries.length ? 1 : 0);
  const ifd0Offset = 8;
  const exifOffset = ifd0Offset + 2 + ifd0Count * 12 + 4;
  const gpsOffset = exifOffset + (exifEntries.length ? ifdSize(exifEntries) : 0);

  const ifd0: Entry[] = [];
  if (spec.orientation) {
    ifd0.push({ tag: 0x0112, type: SHORT, count: 1, value: short(spec.orientation) });
  }
  if (exifEntries.length) {
    ifd0.push({ tag: 0x8769, type: LONG, count: 1, value: long(exifOffset) });
  }
  if (gpsEntries.length) {
    ifd0.push({ tag: 0x8825, type: LONG, count: 1, value: long(gpsOffset) });
  }

  const header = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  return Buffer.concat([
    header,
    writeIfd(ifd0, ifd0Offset),
    exifEntries.length ? writeIfd(exifEntries, exifOffset) : Buffer.alloc(0),
    gpsEntries.length ? writeIfd(gpsEntries, gpsOffset) : Buffer.alloc(0),
  ]);
}

/** A plain JPEG of the given size, optionally with an EXIF block. */
export async function makeJpeg(
  width: number,
  height: number,
  spec: ExifSpec | null = null,
) {
  const jpeg = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    .jpeg()
    .toBuffer();
  if (!spec) return jpeg;

  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), buildTiff(spec)]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  // Right after SOI, the way cameras place it.
  return Buffer.concat([jpeg.subarray(0, 2), app1, payload, jpeg.subarray(2)]);
}
