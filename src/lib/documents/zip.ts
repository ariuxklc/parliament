import { inflateRawSync } from "node:zlib";

/**
 * Minimal ZIP reader (enough for DOCX): central directory lookup + stored/deflate entries.
 * Guards: entry count, uncompressed size cap (zip-bomb safe via `maxOutputLength`), bounds checks.
 */

export class ZipError extends Error {}

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

const MAX_ENTRIES = 5_000;
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;

function readEntries(buf: Buffer): Map<string, Entry> {
  // End of central directory: signature 0x06054b50, within the last 64 KiB + 22 bytes.
  const min = Math.max(0, buf.length - 65_557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES || p >= buf.length) throw new ZipError("bad central directory");
  const entries = new Map<string, Entry>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError("bad central directory entry");
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.set(name, { name, method, compressedSize, uncompressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function readZipEntry(bytes: Uint8Array, name: string): Buffer | null {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entry = readEntries(buf).get(name);
  if (!entry) return null;
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new ZipError("entry too large");
  const lh = entry.localOffset;
  if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034b50) throw new ZipError("bad local header");
  const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  const end = start + entry.compressedSize;
  if (end > buf.length) throw new ZipError("truncated entry");
  const data = buf.subarray(start, end);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
  throw new ZipError(`unsupported compression ${entry.method}`);
}

export function hasZipEntry(bytes: Uint8Array, name: string): boolean {
  try {
    const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return readEntries(buf).has(name);
  } catch {
    return false;
  }
}
