import { createHmac, createSign, timingSafeEqual } from 'node:crypto';

/**
 * Mux Video adapter (https://docs.mux.com/api-reference):
 * - Direct upload (`POST /video/v1/uploads`) — browser файлыг шууд Mux руу `PUT` хийнэ, API-аар дамжихгүй.
 * - Webhook — `mux-signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`.
 * - Signed playback — RS256 JWT (`sub` = playback id, `aud` = v/t/s, `exp`, `kid` = signing key id).
 * - Mux Data (`GET /data/v1/metrics/views/breakdown`) — видео бүрийн үзэлт, үзсэн хугацаа (багшийн аналитик).
 *   Тоглуулагч `video_id` = lesson id, `sub_property_id` = курсийн id metadata илгээдэг (`PlaybackService`).
 * Модулиуд `MUX` token-оор энэ interface-ийг авна. Тест `FakeMux`.
 */
export type MuxTokenAudience = 'v' | 't' | 's';

export interface MuxDirectUpload {
  uploadId: string;
  /** Browser `PUT` хийх URL */
  url: string;
}

/** Upload-ын төлөв (`GET /video/v1/uploads/:id`, `video.upload.*` webhook) */
export interface MuxUploadState {
  status: 'waiting' | 'asset_created' | 'errored' | 'cancelled' | 'timed_out';
  assetId: string | null;
  error: string | null;
}

/** Asset-ийн төлөв (`GET /video/v1/assets/:id`, `video.asset.*` webhook) */
export interface MuxAssetState {
  assetId: string;
  status: 'preparing' | 'ready' | 'errored';
  /** `signed` policy-той playback id */
  playbackId: string | null;
  durationSeconds: number | null;
  error: string | null;
  /** Upload үүсгэхэд өгсөн `passthrough` (манай `lesson_videos.id`) */
  passthrough: string | null;
  uploadId: string | null;
}

/** Mux Data: нэг видеоны (`video_id`) хугацааны хүрээн дэх үзэлт */
export interface MuxVideoEngagement {
  videoId: string;
  views: number;
  /** Нийт үзсэн хугацаа (мс; buffering орно) */
  watchTimeMs: number;
  /** Бодит тоглосон хугацаа (мс) */
  playingTimeMs: number;
}

export interface MuxWebhookEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface MuxAdapter {
  /** Түлхүүр тохируулаагүй бол false — бүх арга `MuxNotConfiguredError` шиднэ. */
  readonly enabled: boolean;
  createDirectUpload(input: { passthrough: string; corsOrigin: string }): Promise<MuxDirectUpload>;
  getUpload(uploadId: string): Promise<MuxUploadState>;
  getAsset(assetId: string): Promise<MuxAssetState>;
  /** Байхгүй (аль хэдийн устсан) asset алдаа биш — давтан дуудахад аюулгүй. */
  deleteAsset(assetId: string): Promise<void>;
  /** Хүлээгдэж буй (`waiting`) direct upload-ыг цуцална — дараа нь asset үүсэхгүй. */
  cancelUpload(uploadId: string): Promise<void>;
  signPlaybackToken(playbackId: string, audience: MuxTokenAudience, ttlSeconds: number, now?: Date): string;
  /** Гарын үсэг + хугацааг шалгаад event буцаана; буруу бол `MuxSignatureError`. */
  parseWebhook(rawBody: Buffer | string, signatureHeader: string | undefined, now?: Date): MuxWebhookEvent;
  /** Mux Data: `sub_property_id`-аар шүүж `video_id`-аар задалсан үзэлт [from, to) хүрээнд. */
  videoEngagement(input: { subPropertyId: string; from: Date; to: Date }): Promise<MuxVideoEngagement[]>;
}

export const MUX = Symbol('MUX');

export class MuxError extends Error {}
export class MuxNotConfiguredError extends MuxError {
  constructor() {
    super('Mux тохируулаагүй (MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_SIGNING_KEY_ID, MUX_SIGNING_KEY_PRIVATE, MUX_WEBHOOK_SECRET)');
  }
}
export class MuxSignatureError extends MuxError {}

/** Webhook-ийн timestamp-ийн зөвшөөрөгдөх зөрүү (replay хамгаалалт) */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const TIMEOUT_MS = 15_000;

// ---- цэвэр функцууд (бодит ба fake adapter хоёулаа) ------------------------------------

export function signMuxWebhook(rawBody: string, secret: string, now = new Date()): string {
  const t = Math.floor(now.getTime() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

export function verifyMuxWebhook(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string,
  now = new Date(),
): MuxWebhookEvent {
  if (!header) throw new MuxSignatureError('mux-signature header алга');
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!Number.isFinite(t) || signatures.length === 0) throw new MuxSignatureError('mux-signature буруу хэлбэртэй');
  if (Math.abs(now.getTime() / 1000 - t) > WEBHOOK_TOLERANCE_SECONDS) throw new MuxSignatureError('Webhook хуучирсан');
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest();
  const ok = signatures.some((s) => {
    const given = Buffer.from(s, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new MuxSignatureError('Webhook-ийн гарын үсэг таарахгүй');
  let parsed: { id?: unknown; type?: unknown; data?: unknown };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    throw new MuxSignatureError('Webhook JSON биш');
  }
  if (typeof parsed.id !== 'string' || typeof parsed.type !== 'string') throw new MuxSignatureError('Webhook-д id/type алга');
  return { id: parsed.id, type: parsed.type, data: (parsed.data as Record<string, unknown>) ?? {} };
}

/** Mux upload объект → төлөв */
export function uploadStateFrom(data: Record<string, unknown>): MuxUploadState {
  const status = String(data.status ?? 'waiting') as MuxUploadState['status'];
  const err = data.error as { message?: string; type?: string } | undefined;
  return {
    status,
    assetId: typeof data.asset_id === 'string' ? data.asset_id : null,
    error: err ? (err.message ?? err.type ?? 'error') : status === 'errored' ? 'error' : null,
  };
}

/** Mux asset объект → төлөв */
export function assetStateFrom(data: Record<string, unknown>): MuxAssetState {
  const ids = Array.isArray(data.playback_ids) ? (data.playback_ids as { id?: string; policy?: string }[]) : [];
  const errors = data.errors as { type?: string; messages?: string[] } | undefined;
  const status = String(data.status ?? 'preparing');
  return {
    assetId: String(data.id ?? ''),
    status: status === 'ready' || status === 'errored' ? status : 'preparing',
    playbackId: ids.find((p) => p.policy === 'signed')?.id ?? null,
    durationSeconds: typeof data.duration === 'number' ? data.duration : null,
    error: errors ? (errors.messages?.join('; ') || errors.type || 'error') : null,
    passthrough: typeof data.passthrough === 'string' ? data.passthrough : null,
    uploadId: typeof data.upload_id === 'string' ? data.upload_id : null,
  };
}

/** Mux Data breakdown мөр → engagement */
export function engagementFrom(row: Record<string, unknown>): MuxVideoEngagement | null {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  if (typeof row.field !== 'string' || row.field === '') return null;
  return {
    videoId: row.field,
    views: num(row.views),
    watchTimeMs: num(row.total_watch_time),
    playingTimeMs: num(row.total_playing_time),
  };
}

/** Breakdown-ийн нэг хуудасны хэмжээ, хамгийн их хуудас (курсийн lesson тоо үүнээс бага) */
const DATA_PAGE_LIMIT = 100;
const DATA_MAX_PAGES = 5;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/** RS256 JWT (Mux signed playback). `privateKeyPem` — PEM RSA private key. */
export function signMuxJwt(
  privateKeyPem: string,
  keyId: string,
  playbackId: string,
  audience: MuxTokenAudience,
  ttlSeconds: number,
  now = new Date(),
): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyId }));
  const payload = base64url(
    JSON.stringify({ sub: playbackId, aud: audience, exp: Math.floor(now.getTime() / 1000) + ttlSeconds, kid: keyId }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKeyPem);
  return `${header}.${payload}.${base64url(signature)}`;
}

// ---- бодит adapter -------------------------------------------------------------------

export interface MuxConfig {
  tokenId: string;
  tokenSecret: string;
  signingKeyId: string;
  /** Mux dashboard-аас авсан base64 PEM (эсвэл шууд PEM) */
  signingKeyPrivate: string;
  webhookSecret: string;
  baseUrl?: string;
}

export class HttpMuxAdapter implements MuxAdapter {
  readonly enabled = true;
  private readonly privateKeyPem: string;
  private readonly baseUrl: string;

  constructor(private readonly config: MuxConfig) {
    const key = config.signingKeyPrivate.trim();
    this.privateKeyPem = key.includes('BEGIN') ? key : Buffer.from(key, 'base64').toString('utf8');
    this.baseUrl = config.baseUrl ?? 'https://api.mux.com';
  }

  async createDirectUpload(input: { passthrough: string; corsOrigin: string }): Promise<MuxDirectUpload> {
    const body = (await this.request('POST', '/video/v1/uploads', {
      cors_origin: input.corsOrigin,
      new_asset_settings: { playback_policies: ['signed'], passthrough: input.passthrough, video_quality: 'basic' },
    })) as { data?: { id?: string; url?: string } };
    if (!body.data?.id || !body.data.url) throw new MuxError('Mux /uploads: id/url алга');
    return { uploadId: body.data.id, url: body.data.url };
  }

  async getUpload(uploadId: string): Promise<MuxUploadState> {
    const body = (await this.request('GET', `/video/v1/uploads/${encodeURIComponent(uploadId)}`)) as {
      data?: Record<string, unknown>;
    };
    return uploadStateFrom(body.data ?? {});
  }

  async getAsset(assetId: string): Promise<MuxAssetState> {
    const body = (await this.request('GET', `/video/v1/assets/${encodeURIComponent(assetId)}`)) as {
      data?: Record<string, unknown>;
    };
    return assetStateFrom(body.data ?? {});
  }

  async deleteAsset(assetId: string): Promise<void> {
    await this.request('DELETE', `/video/v1/assets/${encodeURIComponent(assetId)}`, undefined, [404]);
  }

  async cancelUpload(uploadId: string): Promise<void> {
    await this.request('PUT', `/video/v1/uploads/${encodeURIComponent(uploadId)}/cancel`);
  }

  signPlaybackToken(playbackId: string, audience: MuxTokenAudience, ttlSeconds: number, now = new Date()): string {
    return signMuxJwt(this.privateKeyPem, this.config.signingKeyId, playbackId, audience, ttlSeconds, now);
  }

  parseWebhook(rawBody: Buffer | string, signatureHeader: string | undefined, now = new Date()): MuxWebhookEvent {
    return verifyMuxWebhook(rawBody, signatureHeader, this.config.webhookSecret, now);
  }

  async videoEngagement(input: { subPropertyId: string; from: Date; to: Date }): Promise<MuxVideoEngagement[]> {
    const out: MuxVideoEngagement[] = [];
    for (let page = 1; page <= DATA_MAX_PAGES; page++) {
      const q = new URLSearchParams();
      q.append('group_by', 'video_id');
      q.append('filters[]', `sub_property_id:${input.subPropertyId}`);
      q.append('timeframe[]', String(Math.floor(input.from.getTime() / 1000)));
      q.append('timeframe[]', String(Math.floor(input.to.getTime() / 1000)));
      q.append('limit', String(DATA_PAGE_LIMIT));
      q.append('page', String(page));
      const body = (await this.request('GET', `/data/v1/metrics/views/breakdown?${q.toString()}`)) as {
        data?: Record<string, unknown>[];
        total_row_count?: number;
      };
      const rows = Array.isArray(body.data) ? body.data : [];
      for (const r of rows) {
        const e = engagementFrom(r);
        if (e) out.push(e);
      }
      const total = typeof body.total_row_count === 'number' ? body.total_row_count : rows.length;
      if (rows.length < DATA_PAGE_LIMIT || page * DATA_PAGE_LIMIT >= total) break;
    }
    return out;
  }

  private async request(method: string, path: string, json?: unknown, okStatuses: number[] = []): Promise<unknown> {
    const auth = Buffer.from(`${this.config.tokenId}:${this.config.tokenSecret}`).toString('base64');
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: json === undefined ? undefined : JSON.stringify(json),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok && !okStatuses.includes(res.status)) {
      const text = await res.text().catch(() => '');
      throw new MuxError(`Mux ${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    const text = await res.text();
    return text ? (JSON.parse(text) as unknown) : {};
  }
}

/** Mux тохируулаагүй орчин (dev): апп асна, видеоны үйлдэл 503 `VIDEO_UNAVAILABLE`. */
export class DisabledMuxAdapter implements MuxAdapter {
  readonly enabled = false;
  createDirectUpload(): Promise<MuxDirectUpload> {
    return Promise.reject(new MuxNotConfiguredError());
  }
  getUpload(): Promise<MuxUploadState> {
    return Promise.reject(new MuxNotConfiguredError());
  }
  getAsset(): Promise<MuxAssetState> {
    return Promise.reject(new MuxNotConfiguredError());
  }
  deleteAsset(): Promise<void> {
    return Promise.reject(new MuxNotConfiguredError());
  }
  cancelUpload(): Promise<void> {
    return Promise.reject(new MuxNotConfiguredError());
  }
  signPlaybackToken(): string {
    throw new MuxNotConfiguredError();
  }
  parseWebhook(): MuxWebhookEvent {
    throw new MuxNotConfiguredError();
  }
  videoEngagement(): Promise<MuxVideoEngagement[]> {
    return Promise.reject(new MuxNotConfiguredError());
  }
}

// ---- тестийн fake ----------------------------------------------------------------------

export const FAKE_MUX_WEBHOOK_SECRET = 'fake-mux-webhook-secret';

/**
 * Тестийн Mux: upload/asset-ийн төлөвийг тест өөрөө тогтооно (`setUpload`, `setAsset`),
 * webhook-ийг жинхэнэ HMAC-аар гарын үсэг зурж илгээнэ (`signedWebhook`).
 */
export class FakeMux implements MuxAdapter {
  enabled = true;
  readonly uploads: { uploadId: string; passthrough: string; corsOrigin: string }[] = [];
  readonly deletedAssets: string[] = [];
  readonly cancelledUploads: string[] = [];
  /** Дараагийн N `deleteAsset` дуудлага түр алдаа шиднэ (retry-г шалгах) */
  failures = 0;
  private readonly uploadStates = new Map<string, MuxUploadState>();
  private readonly assetStates = new Map<string, MuxAssetState>();
  private readonly engagement = new Map<string, MuxVideoEngagement[]>();
  /** `videoEngagement` дуудлагууд (тест шалгана) */
  readonly engagementCalls: { subPropertyId: string; from: Date; to: Date }[] = [];
  /** true бол Mux Data алдаа шиднэ (Mux түр унасан мэт) */
  dataFailing = false;
  private seq = 0;

  async createDirectUpload(input: { passthrough: string; corsOrigin: string }): Promise<MuxDirectUpload> {
    this.assertEnabled();
    const uploadId = `upload-${++this.seq}`;
    this.uploads.push({ uploadId, ...input });
    this.uploadStates.set(uploadId, { status: 'waiting', assetId: null, error: null });
    return { uploadId, url: `https://storage.fake-mux.test/upload/${uploadId}` };
  }

  async getUpload(uploadId: string): Promise<MuxUploadState> {
    this.assertEnabled();
    const s = this.uploadStates.get(uploadId);
    if (!s) throw new MuxError(`fake: upload ${uploadId} алга`);
    return s;
  }

  async getAsset(assetId: string): Promise<MuxAssetState> {
    this.assertEnabled();
    const s = this.assetStates.get(assetId);
    if (!s) throw new MuxError(`fake: asset ${assetId} алга`);
    return s;
  }

  async deleteAsset(assetId: string): Promise<void> {
    this.assertEnabled();
    if (this.failures > 0) {
      this.failures -= 1;
      throw new MuxError(`fake: asset ${assetId} устгах түр алдаа`);
    }
    this.deletedAssets.push(assetId);
    this.assetStates.delete(assetId);
  }

  async cancelUpload(uploadId: string): Promise<void> {
    this.assertEnabled();
    const s = this.uploadStates.get(uploadId);
    if (!s) throw new MuxError(`fake: upload ${uploadId} алга`);
    if (s.status !== 'waiting') throw new MuxError(`fake: upload ${uploadId} ${s.status} — цуцлах боломжгүй`);
    this.cancelledUploads.push(uploadId);
    this.uploadStates.set(uploadId, { status: 'cancelled', assetId: null, error: null });
  }

  signPlaybackToken(playbackId: string, audience: MuxTokenAudience, ttlSeconds: number, now = new Date()): string {
    this.assertEnabled();
    return `fake.${audience}.${playbackId}.${Math.floor(now.getTime() / 1000) + ttlSeconds}`;
  }

  parseWebhook(rawBody: Buffer | string, signatureHeader: string | undefined, now = new Date()): MuxWebhookEvent {
    this.assertEnabled();
    return verifyMuxWebhook(rawBody, signatureHeader, FAKE_MUX_WEBHOOK_SECRET, now);
  }

  async videoEngagement(input: { subPropertyId: string; from: Date; to: Date }): Promise<MuxVideoEngagement[]> {
    this.assertEnabled();
    this.engagementCalls.push(input);
    if (this.dataFailing) throw new MuxError('fake: Mux Data HTTP 503');
    return this.engagement.get(input.subPropertyId) ?? [];
  }

  // ---- тестийн удирдлага ----

  /** Mux Data-ийн хариу (курс = `sub_property_id`) */
  setEngagement(subPropertyId: string, rows: MuxVideoEngagement[]): void {
    this.engagement.set(subPropertyId, rows);
  }

  setUpload(uploadId: string, state: MuxUploadState): void {
    this.uploadStates.set(uploadId, state);
  }

  setAsset(state: MuxAssetState): void {
    this.assetStates.set(state.assetId, state);
  }

  /** Webhook-ийн body + `mux-signature` header */
  signedWebhook(event: { id: string; type: string; data: Record<string, unknown> }, now = new Date()) {
    const body = JSON.stringify({ ...event, object: { type: event.type.split('.')[1], id: event.data.id } });
    return { body, signature: signMuxWebhook(body, FAKE_MUX_WEBHOOK_SECRET, now) };
  }

  clear(): void {
    this.enabled = true;
    this.seq = 0;
    this.uploads.length = 0;
    this.deletedAssets.length = 0;
    this.cancelledUploads.length = 0;
    this.failures = 0;
    this.uploadStates.clear();
    this.assetStates.clear();
    this.engagement.clear();
    this.engagementCalls.length = 0;
    this.dataFailing = false;
  }

  private assertEnabled(): void {
    if (!this.enabled) throw new MuxNotConfiguredError();
  }
}
