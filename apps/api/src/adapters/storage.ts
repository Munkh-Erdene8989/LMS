import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Файл хадгалах (Supabase Storage). Browser файлыг API-аар дамжуулахгүй, signed URL-аар шууд
 * storage руу PUT хийнэ; API дараа нь `info()`-оор шалгаж хүлээн авна.
 * - `public` bucket: курсийн зураг (нийтэд URL-аар)
 * - `private` bucket: PDF г.м төлбөртэй контент (богино хугацаатай signed URL)
 */
export type Bucket = 'public' | 'private';

export interface ObjectInfo {
  size: number;
  contentType: string;
}

export interface UploadTarget {
  /** Browser энэ URL руу `PUT` хийж, `Content-Type` header-т файлын төрлийг өгнө. */
  url: string;
  method: 'PUT';
}

export interface StorageAdapter {
  createUploadUrl(bucket: Bucket, key: string): Promise<UploadTarget>;
  info(bucket: Bucket, key: string): Promise<ObjectInfo | null>;
  signedDownloadUrl(bucket: Bucket, key: string, expiresInSeconds: number): Promise<string>;
  publicUrl(key: string): string;
  remove(bucket: Bucket, key: string): Promise<void>;
}

export const STORAGE = Symbol('STORAGE');

export class StorageError extends Error {}

/** https://github.com/supabase/storage — `@supabase/storage-js`-ийн ашигладаг REST замууд. */
export class SupabaseStorage implements StorageAdapter {
  private readonly base: string;

  constructor(
    supabaseUrl: string,
    private readonly serviceKey: string,
    private readonly bucketPrefix = 'lms',
  ) {
    this.base = `${supabaseUrl.replace(/\/$/, '')}/storage/v1`;
  }

  /** Bucket-уудыг (байхгүй бол) үүсгэнэ. */
  async ensureBuckets(): Promise<void> {
    for (const [bucket, isPublic] of [
      ['public', true],
      ['private', false],
    ] as const) {
      const id = this.bucket(bucket);
      const res = await this.request('GET', `/bucket/${id}`);
      if (res.ok) continue;
      const created = await this.request('POST', '/bucket', {
        id,
        name: id,
        public: isPublic,
        // Аппын дээд хязгаар 50MB (PDF/даалгавар). Supabase Free-ийн global limit 50MB тул түүнээс их
        // утга өгвөл bucket үүсгэх 413 EntityTooLarge буцааж, API эхэлж чадахгүй.
        file_size_limit: 50 * 1024 * 1024,
      });
      if (!created.ok && created.status !== 409) {
        throw new StorageError(`Bucket ${id} үүсгэж чадсангүй: ${created.status} ${await created.text()}`);
      }
    }
  }

  async createUploadUrl(bucket: Bucket, key: string): Promise<UploadTarget> {
    const res = await this.request('POST', `/object/upload/sign/${this.bucket(bucket)}/${encodePath(key)}`, {});
    if (!res.ok) throw new StorageError(`signed upload ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { url: string };
    return { url: `${this.base}${data.url}`, method: 'PUT' };
  }

  async info(bucket: Bucket, key: string): Promise<ObjectInfo | null> {
    const res = await this.request('GET', `/object/info/${this.bucket(bucket)}/${encodePath(key)}`);
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new StorageError(`info ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { size?: number; content_type?: string; metadata?: { size?: number; mimetype?: string } };
    return {
      size: data.size ?? data.metadata?.size ?? 0,
      contentType: data.content_type ?? data.metadata?.mimetype ?? 'application/octet-stream',
    };
  }

  async signedDownloadUrl(bucket: Bucket, key: string, expiresInSeconds: number): Promise<string> {
    const res = await this.request('POST', `/object/sign/${this.bucket(bucket)}/${encodePath(key)}`, {
      expiresIn: expiresInSeconds,
    });
    if (!res.ok) throw new StorageError(`signed url ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { signedURL: string };
    return `${this.base}${data.signedURL}`;
  }

  publicUrl(key: string): string {
    return `${this.base}/object/public/${this.bucket('public')}/${encodePath(key)}`;
  }

  async remove(bucket: Bucket, key: string): Promise<void> {
    await this.request('DELETE', `/object/${this.bucket(bucket)}`, { prefixes: [key] });
  }

  private bucket(b: Bucket): string {
    return `${this.bucketPrefix}-${b}`;
  }

  private request(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  }
}

function encodePath(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

/**
 * Dev (Supabase түлхүүргүй): файлыг local дискэнд (`apps/api/.storage`) хадгалж, API-ийн
 * `/dev-storage` замаар HMAC-аар гарын үсэг зурсан URL-аар upload/download хийнэ.
 */
export class LocalDiskStorage implements StorageAdapter {
  constructor(
    private readonly root: string,
    private readonly secret: string,
    /** Browser-ээс харагдах API-ийн суурь зам (web proxy-оор: `/api`) */
    private readonly publicBase: string,
  ) {}

  async createUploadUrl(bucket: Bucket, key: string): Promise<UploadTarget> {
    return { url: this.url('upload', bucket, key, 2 * 3600), method: 'PUT' };
  }

  async info(bucket: Bucket, key: string): Promise<ObjectInfo | null> {
    try {
      const s = await stat(this.file(bucket, key));
      const meta = JSON.parse(await readFile(`${this.file(bucket, key)}.meta.json`, 'utf8')) as { contentType: string };
      return { size: s.size, contentType: meta.contentType };
    } catch {
      return null;
    }
  }

  async signedDownloadUrl(bucket: Bucket, key: string, expiresInSeconds: number): Promise<string> {
    return this.url('file', bucket, key, expiresInSeconds);
  }

  publicUrl(key: string): string {
    return this.url('file', 'public', key, 10 * 365 * 24 * 3600);
  }

  async remove(): Promise<void> {}

  // ---- DevStorageController-д ----

  verify(op: 'upload' | 'file', bucket: string, key: string, exp: string, sig: string): bucket is Bucket {
    if ((bucket !== 'public' && bucket !== 'private') || Number(exp) < Date.now() / 1000) return false;
    const expected = Buffer.from(this.sign(op, bucket, key, exp));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async write(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void> {
    const file = this.file(bucket, key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
  }

  async read(bucket: Bucket, key: string): Promise<{ body: Buffer; contentType: string } | null> {
    const info = await this.info(bucket, key);
    if (!info) return null;
    return { body: await readFile(this.file(bucket, key)), contentType: info.contentType };
  }

  private url(op: 'upload' | 'file', bucket: Bucket, key: string, ttl: number): string {
    const exp = String(Math.floor(Date.now() / 1000) + ttl);
    const q = new URLSearchParams({ bucket, key, exp, sig: this.sign(op, bucket, key, exp) });
    return `${this.publicBase}/dev-storage/${op}?${q}`;
  }

  private sign(op: string, bucket: string, key: string, exp: string): string {
    return createHmac('sha256', this.secret).update(`${op}:${bucket}:${key}:${exp}`).digest('base64url');
  }

  private file(bucket: Bucket, key: string): string {
    const path = resolve(this.root, bucket, key);
    if (!path.startsWith(resolve(this.root, bucket))) throw new StorageError('Буруу зам');
    return path;
  }
}

/** Тестэд: санах ойд. `put()`-оор "browser upload хийсэн" мэт дуурайна. */
export class FakeStorage implements StorageAdapter {
  readonly objects = new Map<string, ObjectInfo>();

  async createUploadUrl(bucket: Bucket, key: string): Promise<UploadTarget> {
    return { url: `https://fake-storage.test/upload/${bucket}/${key}`, method: 'PUT' };
  }

  async info(bucket: Bucket, key: string): Promise<ObjectInfo | null> {
    return this.objects.get(`${bucket}/${key}`) ?? null;
  }

  async signedDownloadUrl(bucket: Bucket, key: string, expiresInSeconds: number): Promise<string> {
    return `https://fake-storage.test/signed/${bucket}/${key}?expiresIn=${expiresInSeconds}`;
  }

  publicUrl(key: string): string {
    return `https://fake-storage.test/public/${key}`;
  }

  async remove(bucket: Bucket, key: string): Promise<void> {
    this.objects.delete(`${bucket}/${key}`);
  }

  put(bucket: Bucket, key: string, info: ObjectInfo): void {
    this.objects.set(`${bucket}/${key}`, info);
  }

  clear(): void {
    this.objects.clear();
  }
}

export const LOCAL_STORAGE_ROOT = join(__dirname, '../../.storage');
