import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { maskIdentifier } from '@lms/shared';
import { HttpMuxAdapter, MuxError, MuxSignatureError, signMuxWebhook } from '../src/adapters/mux';

/**
 * Бодит Mux adapter-ийг Mux-ийг дуурайсан local сервертэй шалгана (сүлжээ рүү гарахгүй):
 * Basic auth, direct upload-ын тохиргоо (signed policy, passthrough), хариуны mapping,
 * RS256 playback JWT, webhook-ийн гарын үсэг.
 */
interface Seen {
  method: string;
  path: string;
  auth: string;
  body: unknown;
}

let server: Server;
let baseUrl: string;
const seen: Seen[] = [];
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : null;
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const body = await readBody(req);
    seen.push({ method: req.method!, path: req.url!, auth: req.headers.authorization ?? '', body });
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'POST' && req.url === '/video/v1/uploads') {
      return json(201, { data: { id: 'up-1', url: 'https://storage.mux.test/up-1', status: 'waiting' } });
    }
    if (req.url === '/video/v1/uploads/up-1') return json(200, { data: { id: 'up-1', status: 'asset_created', asset_id: 'as-1' } });
    if (req.url === '/video/v1/assets/as-1') {
      return json(200, {
        data: {
          id: 'as-1',
          status: 'ready',
          duration: 61.5,
          passthrough: 'vid-1',
          upload_id: 'up-1',
          playback_ids: [
            { id: 'pb-public', policy: 'public' },
            { id: 'pb-signed', policy: 'signed' },
          ],
        },
      });
    }
    if (req.method === 'DELETE' && req.url === '/video/v1/assets/gone') return json(404, { error: { type: 'not_found' } });
    if (req.method === 'DELETE') {
      res.writeHead(204);
      return res.end();
    }
    return json(500, { error: { type: 'boom' } });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  seen.length = 0;
});

const adapter = (key = privatePem) =>
  new HttpMuxAdapter({ tokenId: 'tid', tokenSecret: 'tsecret', signingKeyId: 'kid-1', signingKeyPrivate: key, webhookSecret: 'whsec', baseUrl });

describe('HttpMuxAdapter', () => {
  it('direct upload: Basic auth, signed playback policy, passthrough, CORS origin', async () => {
    const up = await adapter().createDirectUpload({ passthrough: 'vid-1', corsOrigin: 'https://lms.mn' });
    expect(up).toEqual({ uploadId: 'up-1', url: 'https://storage.mux.test/up-1' });
    expect(seen[0]).toMatchObject({
      method: 'POST',
      auth: `Basic ${Buffer.from('tid:tsecret').toString('base64')}`,
      body: { cors_origin: 'https://lms.mn', new_asset_settings: { playback_policies: ['signed'], passthrough: 'vid-1' } },
    });
  });

  it('upload/asset төлөвийг map хийнэ (signed playback id-г сонгоно); 404 устгалт алдаа биш; бусад HTTP алдаа MuxError', async () => {
    const mux = adapter();
    expect(await mux.getUpload('up-1')).toEqual({ status: 'asset_created', assetId: 'as-1', error: null });
    expect(await mux.getAsset('as-1')).toEqual({
      assetId: 'as-1',
      status: 'ready',
      playbackId: 'pb-signed',
      durationSeconds: 61.5,
      error: null,
      passthrough: 'vid-1',
      uploadId: 'up-1',
    });
    await expect(mux.deleteAsset('gone')).resolves.toBeUndefined();
    await expect(mux.deleteAsset('as-1')).resolves.toBeUndefined();
    await expect(mux.getAsset('nope')).rejects.toBeInstanceOf(MuxError);
  });

  it('playback token: RS256 JWT (sub, aud, exp, kid), base64 PEM ч хүлээн авна', () => {
    const now = new Date('2026-11-17T00:00:00Z');
    for (const key of [privatePem, Buffer.from(privatePem).toString('base64')]) {
      const jwt = adapter(key).signPlaybackToken('pb-signed', 'v', 900, now);
      const [h, p, s] = jwt.split('.');
      expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'kid-1' });
      expect(JSON.parse(Buffer.from(p!, 'base64url').toString())).toEqual({
        sub: 'pb-signed',
        aud: 'v',
        exp: now.getTime() / 1000 + 900,
        kid: 'kid-1',
      });
      expect(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s!, 'base64url'))).toBe(true);
    }
  });

  it('webhook: зөв гарын үсэг → event; буруу secret, өөрчилсөн body, хуучирсан timestamp → MuxSignatureError', () => {
    const mux = adapter();
    const body = JSON.stringify({ id: 'evt-1', type: 'video.asset.ready', data: { id: 'as-1' } });
    const now = new Date();
    expect(mux.parseWebhook(Buffer.from(body), signMuxWebhook(body, 'whsec', now), now)).toEqual({
      id: 'evt-1',
      type: 'video.asset.ready',
      data: { id: 'as-1' },
    });
    expect(() => mux.parseWebhook(body, signMuxWebhook(body, 'other', now), now)).toThrow(MuxSignatureError);
    expect(() => mux.parseWebhook(`${body} `, signMuxWebhook(body, 'whsec', now), now)).toThrow(MuxSignatureError);
    expect(() => mux.parseWebhook(body, signMuxWebhook(body, 'whsec', new Date(now.getTime() - 6 * 60_000)), now)).toThrow(
      MuxSignatureError,
    );
    expect(() => mux.parseWebhook(body, undefined, now)).toThrow(MuxSignatureError);
  });
});

describe('maskIdentifier (watermark)', () => {
  it('утас, имэйлийн хэсэгчилсэн хэлбэр', () => {
    expect(maskIdentifier('PHONE', '+97699112233')).toBe('9911****');
    expect(maskIdentifier('PHONE', '99112233')).toBe('9911****');
    expect(maskIdentifier('EMAIL', 'bold@gmail.com')).toBe('bo***@gmail.com');
  });
});
