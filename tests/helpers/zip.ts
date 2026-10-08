import zlib from "node:zlib";
import { expect } from "vitest";

export async function collect(stream: ReadableStream<Uint8Array>) {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

/** Reads an archive back through its central directory, ZIP64 included. */
export function readZip(zip: Buffer) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let count = zip.readUInt16LE(end + 10);
  let directory = zip.readUInt32LE(end + 16);
  if (count === 0xffff) {
    const locator = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
    const record = Number(zip.readBigUInt64LE(locator + 8));
    count = Number(zip.readBigUInt64LE(record + 32));
    directory = Number(zip.readBigUInt64LE(record + 48));
  }
  const files = new Map<string, Buffer>();
  let at = directory;
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(at + 16);
    let size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    let offset = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const extra = zip.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength);
    if (extra.length) {
      expect(extra.readUInt16LE(0)).toBe(1);
      let field = 4;
      if (size === 0xffffffff) {
        size = Number(extra.readBigUInt64LE(field + 8));
        field += 16;
      }
      if (offset === 0xffffffff) offset = Number(extra.readBigUInt64LE(field));
    }
    expect(zip.readUInt32LE(offset)).toBe(0x04034b50);
    const localStart = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    const data = zip.subarray(localStart, localStart + size);
    expect(zlib.crc32(data) >>> 0).toBe(crc);
    files.set(name, data);
    at += 46 + nameLength + extraLength;
  }
  return files;
}
