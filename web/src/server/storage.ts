import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

/** S3-compatible interface. Phase 1 ships the local-disk adapter; an S3 adapter implements the same three methods. */
export interface StorageAdapter {
  put(key: string, body: Uint8Array): Promise<void>;
  /** range is inclusive [start, end], as in an HTTP Range header. size is always the whole object's size. */
  get(key: string, range?: { start: number; end: number }): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null>;
  delete(key: string): Promise<void>;
}

export class LocalDiskStorage implements StorageAdapter {
  constructor(private root: string) {
    fs.mkdirSync(root, { recursive: true });
  }
  private file(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, body: Uint8Array) {
    const p = this.file(key);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, body);
  }
  async get(key: string, range?: { start: number; end: number }) {
    const p = this.file(key);
    const stat = await fs.promises.stat(p).catch(() => null);
    if (!stat) return null;
    return { stream: Readable.toWeb(fs.createReadStream(p, range)) as ReadableStream<Uint8Array>, size: stat.size };
  }
  async delete(key: string) {
    await fs.promises.rm(this.file(key), { force: true });
  }
}

let adapter: StorageAdapter | undefined;
export function storage(): StorageAdapter {
  adapter ??= new LocalDiskStorage(process.env.UPLOAD_DIR ?? path.join(process.env.DATA_DIR ?? path.join(process.cwd(), ".data"), "uploads"));
  return adapter;
}
