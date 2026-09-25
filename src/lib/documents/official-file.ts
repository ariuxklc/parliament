import { createHash } from "node:crypto";

/**
 * Downloads an official project file from LawForum. SSRF-safe by construction:
 *  - the caller passes a numeric LawForum file id (taken from official project metadata), never a URL;
 *  - the URL is built here on the one allowed host; redirects are followed manually and only on that host;
 *  - size is capped while streaming, and the content is sniffed (PDF / ZIP / OLE) before any parser sees it.
 */

export const LAWFORUM_HOST = "lawforum.parliament.mn";
export const MAX_FILE_BYTES = 30 * 1024 * 1024;

export class OfficialFileError extends Error {
  code: "bad-id" | "http" | "network" | "too-large" | "host";
  constructor(code: OfficialFileError["code"], message: string) {
    super(message);
    this.name = "OfficialFileError";
    this.code = code;
  }
}

export type SniffedType = "pdf" | "zip" | "ole" | "unknown";

export function sniff(bytes: Uint8Array): SniffedType {
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "pdf"; // %PDF-
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return "zip"; // PK\3\4
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "ole"; // legacy .doc/.xls
  return "unknown";
}

export interface OfficialFile {
  fileId: number;
  url: string;
  bytes: Uint8Array;
  sha256: string;
  contentType: string | null;
  type: SniffedType;
}

export async function downloadOfficialFile(fileId: number, opts: { timeoutMs?: number; maxBytes?: number } = {}): Promise<OfficialFile> {
  if (!Number.isInteger(fileId) || fileId <= 0 || fileId > 999_999_999) throw new OfficialFileError("bad-id", "invalid file id");
  const maxBytes = opts.maxBytes ?? MAX_FILE_BYTES;
  let url = `https://${LAWFORUM_HOST}/files/${fileId}/?d=1`;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 90_000);

  let res: Response | null = null;
  for (let hop = 0; hop < 3; hop++) {
    try {
      res = await fetch(url, { redirect: "manual", signal, cache: "no-store", headers: { Accept: "*/*" } });
    } catch {
      throw new OfficialFileError("network", `file ${fileId}: network error`);
    }
    if (res.status >= 300 && res.status < 400) {
      const next = new URL(res.headers.get("location") ?? "", url);
      if (next.protocol !== "https:" || next.hostname !== LAWFORUM_HOST) throw new OfficialFileError("host", `file ${fileId}: redirect off ${LAWFORUM_HOST}`);
      url = next.toString();
      continue;
    }
    break;
  }
  if (!res || !res.ok || !res.body) throw new OfficialFileError("http", `file ${fileId}: HTTP ${res?.status ?? "?"}`);
  const declared = Number(res.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) throw new OfficialFileError("too-large", `file ${fileId}: ${declared} bytes`);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new OfficialFileError("too-large", `file ${fileId}: over ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return {
    fileId,
    url,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    contentType: res.headers.get("content-type"),
    type: sniff(bytes),
  };
}
