import { BullMqJobQueue } from '../src/queue/bullmq-queue';

/**
 * BullMQ adapter-ийг бодит Redis-тэй шалгана. `REDIS_URL_TEST` байхгүй бол алгасна
 * (local-д Redis байхгүй байж болно; CI Redis service container-тэй).
 */
const url = process.env.REDIS_URL_TEST;
const describeRedis = url ? describe : describe.skip;

describeRedis('BullMqJobQueue (Redis)', () => {
  let queue: BullMqJobQueue;

  beforeEach(async () => {
    queue = new BullMqJobQueue(url!, { queueName: `test-${Date.now()}`, runWorker: true, concurrency: 1 });
  });
  afterEach(async () => {
    await queue.obliterate();
    await queue.close();
  });

  function waitFor(predicate: () => boolean, ms = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (predicate()) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - started > ms) {
          clearInterval(timer);
          reject(new Error('waitFor timeout'));
        }
      }, 50);
    });
  }

  it('ажлыг handler руу дамжуулж гүйцэтгэнэ', async () => {
    const seen: unknown[] = [];
    queue.register<{ n: number }>('echo', async (data) => {
      seen.push(data.n);
    });
    await queue.start();
    await queue.add('echo', { n: 1 });
    await queue.add('echo', { n: 2 });
    await waitFor(() => seen.length === 2);
    expect(seen.sort()).toEqual([1, 2]);
  });

  it('алдаа гарвал backoff-оор дахин оролдоно', async () => {
    const attempts: number[] = [];
    queue.register(
      'flaky',
      async (_data, ctx) => {
        attempts.push(ctx.attempt);
        if (ctx.attempt < 3) throw new Error('fail');
      },
      { attempts: 3, backoffMs: 20 },
    );
    await queue.start();
    await queue.add('flaky', {});
    await waitFor(() => attempts.length === 3);
    expect(attempts).toEqual([1, 2, 3]);
  });

  it('ижил jobId-тай ажлыг дахин нэмэхгүй', async () => {
    let runs = 0;
    queue.register('once', async () => {
      runs += 1;
    });
    await queue.add('once', {}, { jobId: 'same', delayMs: 300 });
    await queue.add('once', {}, { jobId: 'same', delayMs: 300 });
    await queue.start();
    await new Promise((r) => setTimeout(r, 1500));
    expect(runs).toBe(1);
  });

  it('cron scheduler бүртгэнэ', async () => {
    await queue.schedule('nightly', '30 3 * * *');
  });
});
