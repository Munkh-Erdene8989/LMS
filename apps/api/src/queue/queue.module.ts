import { Global, Inject, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ENV, type Env } from '../env';
import { BullMqJobQueue } from './bullmq-queue';
import { InMemoryJobQueue } from './in-memory-queue';
import { JOB_QUEUE, type JobQueue } from './job-queue';

/**
 * Модулиуд `onModuleInit`-д handler-ээ бүртгэнэ; бүх модуль бэлэн болсны дараа
 * (`onApplicationBootstrap`) worker асна.
 */
@Global()
@Module({
  providers: [
    {
      provide: JOB_QUEUE,
      inject: [ENV],
      useFactory: (env: Env): JobQueue => {
        if (env.REDIS_URL) return new BullMqJobQueue(env.REDIS_URL, { runWorker: env.WORKERS_ENABLED });
        new Logger('Queue').warn('REDIS_URL алга — process доторх дараалал (dev)');
        return new InMemoryJobQueue('auto');
      },
    },
  ],
  exports: [JOB_QUEUE],
})
export class QueueModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(JOB_QUEUE) private readonly queue: JobQueue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
