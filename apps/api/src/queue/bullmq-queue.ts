import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Queue, Worker, type Job } from 'bullmq';
import {
  QUEUE_TIMEZONE,
  type AddJobOptions,
  type JobDefinition,
  type JobHandler,
  type JobQueue,
} from './job-queue';

/**
 * BullMQ + Redis (Railway). Нэг queue, ажлыг нэрээр нь handler руу чиглүүлнэ.
 * Retry/backoff нь handler бүртгэхэд өгсөн `JobDefinition`-оос.
 */
export class BullMqJobQueue implements JobQueue {
  private readonly queue: Queue;
  private worker: Worker | null = null;
  private readonly handlers = new Map<string, { handler: JobHandler; definition?: JobDefinition }>();
  private readonly log = new Logger('BullMqJobQueue');
  private readonly scheduled = new Set<string>();

  constructor(
    private readonly redisUrl: string,
    private readonly options: { queueName?: string; runWorker: boolean; concurrency?: number },
  ) {
    this.queue = new Queue(options.queueName ?? 'lms', { connection: this.connection() });
  }

  register<T>(name: string, handler: JobHandler<T>, definition?: JobDefinition): void {
    this.handlers.set(name, { handler: handler as JobHandler, definition });
  }

  async add<T>(name: string, data: T, options: AddJobOptions = {}): Promise<void> {
    const definition = this.handlers.get(name)?.definition;
    await this.queue.add(name, data, {
      jobId: options.jobId,
      delay: options.delayMs,
      attempts: definition?.attempts ?? 1,
      backoff: definition?.backoffMs ? { type: 'exponential', delay: definition.backoffMs } : undefined,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });
  }

  async schedule(name: string, cron: string): Promise<void> {
    await this.queue.upsertJobScheduler(name, { pattern: cron, tz: QUEUE_TIMEZONE }, { name, data: {} });
    this.scheduled.add(name);
    this.log.log(`Cron бүртгэв: ${name} "${cron}" (${QUEUE_TIMEZONE})`);
  }

  async start(): Promise<void> {
    if (!this.options.runWorker || this.worker) return;
    this.worker = new Worker(
      this.queue.name,
      async (job: Job) => {
        const entry = this.handlers.get(job.name);
        if (!entry) throw new Error(`"${job.name}" handler бүртгэгдээгүй`);
        await entry.handler(job.data, {
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts ?? 1,
        });
      },
      { connection: this.connection(), concurrency: this.options.concurrency ?? 5 },
    );
    this.worker.on('failed', (job, err) => {
      this.log.warn(`Ажил "${job?.name}" (${job?.id}) амжилтгүй [${job?.attemptsMade}]: ${err.message}`);
      // Сүүлчийн оролдлого унавал Sentry-д (идэвхгүй бол no-op).
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        Sentry.captureException(err, { tags: { job: job.name }, extra: { jobId: job.id } });
      }
    });
    // Cron ажил цагтаа ажилласныг production log-оос шалгахад (docs/DEPLOY.md).
    this.worker.on('completed', (job) => {
      if (this.scheduled.has(job.name)) this.log.log(`Cron ажил "${job.name}" дууслаа`);
    });
    this.worker.on('error', (err) => this.log.error(`Worker алдаа: ${err.message}`));
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }

  /** Тестэд: queue-ийн бүх өгөгдлийг устгана. */
  async obliterate(): Promise<void> {
    await this.queue.obliterate({ force: true });
  }

  private connection() {
    // Worker блоклодог команд ашигладаг тул retry-г хязгааргүй (BullMQ-ийн зөвлөмж).
    return { url: this.redisUrl, maxRetriesPerRequest: null };
  }
}
