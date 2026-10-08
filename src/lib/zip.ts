import "server-only";

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import zlib from "node:zlib";

/**
 * A ZIP archive written as a stream, for exports. Entries are stored, not
 * compressed – photos and videos are compressed already, and storing keeps
 * memory flat whatever the size. Each file is read twice (once for its
 * CRC, once for its bytes), so headers carry real sizes and every unzip
 * tool understands them; ZIP64 kicks in only past 4 GB.
 *
 * Written by hand instead of adding a dependency: storing is the simple
 * part of the format, and `zlib.crc32` does the arithmetic.
 */

export type ZipEntry =
  | { name: string; data: Buffer | string }
  | { name: string; file: string };

const MAX32 = 0xffffffff;

type Written = { name: Buffer; crc: number; size: number; offset: number };

/** DOS date and time of `date`, as ZIP headers want them. */
function dosTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

async function fileCrc(file: string) {
  let crc = 0;
  for await (const chunk of createReadStream(file)) crc = zlib.crc32(chunk as Buffer, crc);
  return crc;
}

function zip64Extra(fields: bigint[]) {
  const extra = Buffer.alloc(4 + fields.length * 8);
  extra.writeUInt16LE(0x0001, 0);
  extra.writeUInt16LE(fields.length * 8, 2);
  fields.forEach((value, index) => extra.writeBigUInt64LE(value, 4 + index * 8));
  return extra;
}

function localHeader(entry: Written, stamp: { time: number; day: number }, force64: boolean) {
  const big = force64 || entry.size >= MAX32;
  const extra = big ? zip64Extra([BigInt(entry.size), BigInt(entry.size)]) : Buffer.alloc(0);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(big ? 45 : 20, 4); // version needed
  header.writeUInt16LE(0x0800, 6); // names are UTF-8
  header.writeUInt16LE(0, 8); // stored
  header.writeUInt16LE(stamp.time, 10);
  header.writeUInt16LE(stamp.day, 12);
  header.writeUInt32LE(entry.crc >>> 0, 14);
  header.writeUInt32LE(big ? MAX32 : entry.size, 18);
  header.writeUInt32LE(big ? MAX32 : entry.size, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(extra.length, 28);
  return Buffer.concat([header, entry.name, extra]);
}

function centralHeader(entry: Written, stamp: { time: number; day: number }, force64: boolean) {
  const bigSize = force64 || entry.size >= MAX32;
  const bigOffset = force64 || entry.offset >= MAX32;
  const fields: bigint[] = [];
  if (bigSize) fields.push(BigInt(entry.size), BigInt(entry.size));
  if (bigOffset) fields.push(BigInt(entry.offset));
  const extra = fields.length ? zip64Extra(fields) : Buffer.alloc(0);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE((3 << 8) | 45, 4); // made by: Unix, 4.5
  header.writeUInt16LE(fields.length ? 45 : 20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(stamp.time, 12);
  header.writeUInt16LE(stamp.day, 14);
  header.writeUInt32LE(entry.crc >>> 0, 16);
  header.writeUInt32LE(bigSize ? MAX32 : entry.size, 20);
  header.writeUInt32LE(bigSize ? MAX32 : entry.size, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(extra.length, 30);
  header.writeUInt16LE(0, 32); // comment
  header.writeUInt16LE(0, 34); // disk
  header.writeUInt16LE(0, 36); // internal attributes
  header.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
  header.writeUInt32LE(bigOffset ? MAX32 : entry.offset, 42);
  return Buffer.concat([header, entry.name, extra]);
}

function endRecords(count: number, directoryOffset: number, directorySize: number, force64: boolean) {
  const big = force64 || count >= 0xffff || directoryOffset >= MAX32 || directorySize >= MAX32;
  const parts: Buffer[] = [];
  if (big) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    record.writeBigUInt64LE(BigInt(44), 4);
    record.writeUInt16LE(45, 12);
    record.writeUInt16LE(45, 14);
    record.writeUInt32LE(0, 16);
    record.writeUInt32LE(0, 20);
    record.writeBigUInt64LE(BigInt(count), 24);
    record.writeBigUInt64LE(BigInt(count), 32);
    record.writeBigUInt64LE(BigInt(directorySize), 40);
    record.writeBigUInt64LE(BigInt(directoryOffset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeUInt32LE(0, 4);
    locator.writeBigUInt64LE(BigInt(directoryOffset + directorySize), 8);
    locator.writeUInt32LE(1, 16);
    parts.push(record, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(big ? 0xffff : count, 8);
  end.writeUInt16LE(big ? 0xffff : count, 10);
  end.writeUInt32LE(big ? MAX32 : directorySize, 12);
  end.writeUInt32LE(big ? MAX32 : directoryOffset, 16);
  parts.push(end);
  return Buffer.concat(parts);
}

/**
 * The archive as a byte stream. `entries` is consumed lazily, so a caller
 * can produce files (a rendered map, say) only when their turn comes.
 * `force64` writes ZIP64 records for small archives too – for tests.
 */
export function zipStream(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
  options: { force64?: boolean; date?: Date } = {},
): ReadableStream<Uint8Array> {
  const force64 = options.force64 ?? false;
  const stamp = dosTime(options.date ?? new Date());

  async function* bytes(): AsyncGenerator<Buffer> {
    const written: Written[] = [];
    let offset = 0;
    for await (const entry of entries) {
      const name = Buffer.from(entry.name, "utf8");
      if ("file" in entry) {
        const size = (await fs.stat(entry.file)).size;
        const record = { name, crc: await fileCrc(entry.file), size, offset };
        const header = localHeader(record, stamp, force64);
        yield header;
        let streamed = 0;
        for await (const chunk of createReadStream(entry.file)) {
          streamed += (chunk as Buffer).length;
          yield chunk as Buffer;
        }
        // A file that changed between both reads would corrupt the archive.
        if (streamed !== size) throw new Error(`File changed while zipping: ${entry.name}`);
        offset += header.length + size;
        written.push(record);
      } else {
        const data = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : entry.data;
        const record = { name, crc: zlib.crc32(data), size: data.length, offset };
        const header = localHeader(record, stamp, force64);
        yield header;
        yield data;
        offset += header.length + data.length;
        written.push(record);
      }
    }
    let directorySize = 0;
    for (const entry of written) {
      const header = centralHeader(entry, stamp, force64);
      directorySize += header.length;
      yield header;
    }
    yield endRecords(written.length, offset, directorySize, force64);
  }

  const iterator = bytes();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}
