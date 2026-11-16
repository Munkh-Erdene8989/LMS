import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, type TestApp } from './harness';

describe('GET /health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  it('DB холбогдсон үед ok буцаана', async () => {
    const res = await t.http().get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok', brand: 'LMS' });
    expect(typeof res.body.time).toBe('string');
  });
});

describe('Тестийн орчин', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('reset нь өмнөх тестийн өгөгдлийг цэвэрлэнэ', async () => {
    await t.prisma.setting.create({ data: { key: 'probe', value: 1 } });
    expect(await t.prisma.setting.count()).toBe(1);
    await t.reset();
    expect(await t.prisma.setting.count()).toBe(0);
  });

  it('гадны сервисүүд fake-ээр орлуулагдсан', async () => {
    expect(t.phone.sessions).toEqual([]);
    expect(t.email.sent).toEqual([]);
  });
});

describe('GET /health — DB унасан үед', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ override: (b) =>
      b.overrideProvider(PrismaService).useValue({
        $queryRaw: () => Promise.reject(new Error('connection refused')),
        $disconnect: () => Promise.resolve(),
      }),
    });
  });
  afterAll(() => t.close());

  it('degraded буцаана, апп унахгүй', async () => {
    const res = await t.http().get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'error' });
  });
});
