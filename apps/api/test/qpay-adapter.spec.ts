import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpQPayAdapter, QPayCardNotSupportedError, QPayError } from '../src/adapters/qpay';

/**
 * Бодит HTTP adapter-ийг QPay-г дуурайсан local сервертэй шалгана (сүлжээ рүү гарахгүй):
 * Basic auth → token cache, 401 үед нэг удаа дахин auth, хариуны талбаруудын mapping.
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
let tokenSeq = 0;
let rejectNextBearer = false;

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
    if (req.url === '/v2/auth/token') {
      const expected = `Basic ${Buffer.from('cid:secret').toString('base64')}`;
      if (req.headers.authorization !== expected) return json(401, { error: 'NO_CREDENTIALS' });
      tokenSeq++;
      return json(200, {
        token_type: 'bearer',
        access_token: `access-${tokenSeq}`,
        refresh_token: `refresh-${tokenSeq}`,
        // QPay: Unix timestamp (секунд)
        expires_in: Math.floor(Date.now() / 1000) + 86_400,
        refresh_expires_in: Math.floor(Date.now() / 1000) + 2 * 86_400,
      });
    }
    if (!req.headers.authorization?.startsWith('Bearer access-') || rejectNextBearer) {
      rejectNextBearer = false;
      return json(401, { error: 'AUTHENTICATION_FAILED' });
    }
    if (req.url === '/v2/invoice') {
      return json(200, {
        invoice_id: 'inv-1',
        qr_text: 'qr-text',
        qr_image: 'iVBORw0KGgo=',
        qPay_shortUrl: 'https://s.qpay.mn/x',
        urls: [{ name: 'Khan bank', description: 'Хаан банк', logo: 'https://qpay.mn/khan.png', link: 'khanbank://q?x' }],
      });
    }
    if (req.url === '/v2/payment/check') {
      return json(200, {
        count: 2,
        paid_amount: 10000,
        rows: [
          { payment_id: 'p1', payment_status: 'PAID', payment_amount: '10000.00', payment_currency: 'MNT' },
          { payment_id: 'p2', payment_status: 'FAILED', payment_amount: '10000.00', payment_currency: 'MNT' },
        ],
      });
    }
    if (req.method === 'DELETE' && req.url === '/v2/invoice/inv-1') {
      res.writeHead(200);
      return res.end();
    }
    json(404, {});
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  seen.length = 0;
});

const adapter = (secret = 'secret') =>
  new HttpQPayAdapter({ clientId: 'cid', clientSecret: secret, invoiceCode: 'LMS_INVOICE', baseUrl });

it('нэхэмжлэх үүсгэх: хүсэлтийн талбарууд, хариуны mapping, токен cache', async () => {
  const q = adapter();
  const inv = await q.createInvoice({
    senderInvoiceNo: 'abc123',
    receiverCode: 'terminal',
    description: 'LMS: 10 кредит',
    amountMnt: 10_000,
    callbackUrl: 'https://lms.mn/api/payments/qpay/callback/tok',
  });
  expect(inv).toEqual({
    invoiceId: 'inv-1',
    qrText: 'qr-text',
    qrImage: 'iVBORw0KGgo=',
    shortUrl: 'https://s.qpay.mn/x',
    urls: [expect.objectContaining({ link: 'khanbank://q?x' })],
  });
  expect(seen.find((s) => s.path === '/v2/invoice')!.body).toEqual({
    invoice_code: 'LMS_INVOICE',
    sender_invoice_no: 'abc123',
    invoice_receiver_code: 'terminal',
    invoice_description: 'LMS: 10 кредит',
    amount: 10_000,
    callback_url: 'https://lms.mn/api/payments/qpay/callback/tok',
  });

  const check = await q.checkInvoice('inv-1');
  expect(check).toEqual({
    paidAmountMnt: 10_000,
    rows: [
      { paymentId: 'p1', status: 'PAID', amountMnt: 10_000 },
      { paymentId: 'p2', status: 'FAILED', amountMnt: 10_000 },
    ],
  });
  expect(seen.find((s) => s.path === '/v2/payment/check')!.body).toEqual({
    object_type: 'INVOICE',
    object_id: 'inv-1',
    offset: { page_number: 1, page_limit: 100 },
  });
  // Токеныг нэг л удаа авсан
  expect(seen.filter((s) => s.path === '/v2/auth/token')).toHaveLength(1);
});

it('401 үед токеныг шинээр авч нэг удаа давтана', async () => {
  const q = adapter();
  await q.checkInvoice('inv-1');
  rejectNextBearer = true;
  await q.checkInvoice('inv-1');
  expect(seen.filter((s) => s.path === '/v2/payment/check')).toHaveLength(3);
  expect(seen.filter((s) => s.path.startsWith('/v2/auth/'))).toHaveLength(2);
});

it('буруу түлхүүр → QPayError', async () => {
  await expect(adapter('wrong').checkInvoice('inv-1')).rejects.toBeInstanceOf(QPayError);
});

it('нэхэмжлэх цуцлах: DELETE /v2/invoice/{id} (хоосон хариу ч болно)', async () => {
  await adapter().cancelInvoice('inv-1');
  expect(seen.find((s) => s.method === 'DELETE')).toMatchObject({ path: '/v2/invoice/inv-1', body: null });
  await expect(adapter().cancelInvoice('missing')).rejects.toBeInstanceOf(QPayError);
});

it('карт токен (батлагдаагүй): бодит adapter дэмжихгүй, QPay руу хүсэлт илгээхгүй', async () => {
  const q = adapter();
  expect(q.cardTokensSupported).toBe(false);
  await expect(q.registerCard()).rejects.toBeInstanceOf(QPayCardNotSupportedError);
  await expect(q.getCardRegistration()).rejects.toBeInstanceOf(QPayCardNotSupportedError);
  await expect(q.chargeCard()).rejects.toBeInstanceOf(QPayCardNotSupportedError);
  await expect(q.removeCard()).rejects.toBeInstanceOf(QPayCardNotSupportedError);
  expect(seen).toHaveLength(0);
});
