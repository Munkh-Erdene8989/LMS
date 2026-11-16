import { Logger } from '@nestjs/common';
import {
  backoffDelay,
  type AddJobOptions,
  type JobDefinition,
  type JobHandler,
  type JobQueue,
} from './job-queue';

export interface MemoryJob {
  id: string;
  name: string;
  data: unknown;
  /** Хийгдсэн оролдлогын тоо */
  attempts: number;
  maxAttempts: number;
  runAt: number;
  status: 'waiting' | 'completed' | 'failed';
  error?: string;
}

/**
 * Process доторх дараалал.
 * - `auto` (dev, Redis байхгүй): ажлыг нэмэнгүүт арын горимд ажиллуулна, retry-г delay-тэй.
 *   Cron ажиллахгүй (зөвхөн log) — Redis-тэй орчинд л.
 * - `manual` (тест): юу ч өөрөө ажиллахгүй; тест `drain()` / `runScheduled()`-ээр удирдана.
 */
export class InMemoryJobQueue implements JobQueue {
  readonly jobs: MemoryJob[] = [];
  readonly schedules = new Map<string, string>();
  private readonly handlers = new Map<string, { handler: JobHandler; definition?: JobDefinition }>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly log = new Logger('InMemoryJobQueue');
  private seq = 0;
  private started = false;

  constructor(private readonly mode: 'auto' | 'manual') {}

  register<T>(name: string, handler: JobHandler<T>, definition?: JobDefinition): void {
    this.handlers.set(name, { handler: handler as JobHandler, definition });
  }

  async add<T>(name: string, data: T, options: AddJobOptions = {}): Promise<void> {
    const id = options.jobId ?? `job-${++this.seq}`;
    if (this.jobs.some((j) => j.id === id)) return;
    const job: MemoryJob = {
      id,
      name,
      data,
      attempts: 0,
      maxAttempts: this.handlers.get(name)?.definition?.attempts ?? 1,
      runAt: Date.now() + (options.delayMs ?? 0),
      status: 'waiting',
    };
    this.jobs.push(job);
    if (this.mode === 'auto' && this.started) this.plan(job);
  }

  async schedule(name: string, cron: string): Promise<void> {
    this.schedules.set(name, cron);
    if (this.mode === 'auto') this.log.log(`Cron "${name}" (${cron}) — Redis байхгүй тул dev-д ажиллахгүй`);
  }

  async start(): Promise<void> {
    this.started = true;
    if (this.mode === 'auto') for (const job of this.jobs.filter((j) => j.status === 'waiting')) this.plan(job);
  }

  async close(): Promise<void> {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.started = false;
  }

  // ---- тестийн удирдлага ------------------------------------------------------

  /** Хүлээгдэж буй бүх ажлыг (delay, backoff үл харгалзан) дуустал ажиллуулна. */
  async drain(): Promise<void> {
    for (let guard = 0; guard < 1000; guard++) {
      const job = this.jobs.find((j) => j.status === 'waiting');
      if (!job) return;
      await this.runOnce(job);
    }
    throw new Error('InMemoryJobQueue.drain: хэт олон давталт');
  }

  /** Cron ажлыг нэг удаа гараар ажиллуулна. */
  async runScheduled(name: string): Promise<void> {
    if (!this.schedules.has(name)) throw new Error(`"${name}" cron бүртгэгдээгүй`);
    await this.add(name, {});
    await this.drain();
  }

  byName(name: string): MemoryJob[] {
    return this.jobs.filter((j) => j.name === name);
  }

  clear(): void {
    this.jobs.length = 0;
  }

  // ---- дотоод ------------------------------------------------------------------

  private plan(job: MemoryJob): void {
    const timer = setTimeout(
      () => {
        this.timers.delete(timer);
        void this.runOnce(job).then(() => {
          if (job.status === 'waiting') this.plan(job);
        });
      },
      Math.max(0, job.runAt - Date.now()),
    );
    this.timers.add(timer);
  }

  private async runOnce(job: MemoryJob): Promise<void> {
    const entry = this.handlers.get(job.name);
    job.attempts += 1;
    if (!entry) {
      job.status = 'failed';
      job.error = `"${job.name}" handler бүртгэгдээгүй`;
      return;
    }
    try {
      await entry.handler(job.data, { attempt: job.attempts, maxAttempts: job.maxAttempts });
      job.status = 'completed';
    } catch (err) {
      job.error = (err as Error).message;
      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
        this.log.error(`Ажил "${job.name}" (${job.id}) бүрмөсөн амжилтгүй: ${job.error}`);
      } else {
        job.runAt = Date.now() + backoffDelay(entry.definition, job.attempts);
      }
    }
  }
}
