/**
 * Арын ажлын дараалал. Модулиуд BullMQ-г шууд ашиглахгүй, зөвхөн энэ interface-ийг.
 * Production: BullMQ + Redis. Dev (`REDIS_URL` байхгүй) ба тест: process доторх дараалал.
 */
export interface JobContext {
  /** 1-ээс эхэлнэ */
  attempt: number;
  maxAttempts: number;
}

export type JobHandler<T = unknown> = (data: T, ctx: JobContext) => Promise<void>;

export interface JobDefinition {
  /** Нийт оролдлого (эхнийх орно). Анхдагч 1. */
  attempts?: number;
  /** Exponential backoff-ийн суурь (ms): 2-р оролдлого `backoffMs`, 3-р `2×backoffMs`... */
  backoffMs?: number;
}

export interface AddJobOptions {
  /** Ижил `jobId`-тай ажил аль хэдийн байвал дахин нэмэхгүй (idempotent). */
  jobId?: string;
  delayMs?: number;
}

export interface JobQueue {
  register<T>(name: string, handler: JobHandler<T>, definition?: JobDefinition): void;
  add<T>(name: string, data: T, options?: AddJobOptions): Promise<void>;
  /** Cron-оор давтагдах ажил (Улаанбаатарын цагаар). Ижил нэрээр дахин дуудвал шинэчилнэ. */
  schedule(name: string, cron: string): Promise<void>;
  /** Бүх handler бүртгэгдсэний дараа worker-ийг асаана. */
  start(): Promise<void>;
  close(): Promise<void>;
}

export const JOB_QUEUE = Symbol('JOB_QUEUE');
export const QUEUE_TIMEZONE = 'Asia/Ulaanbaatar';

export function backoffDelay(definition: JobDefinition | undefined, failedAttempt: number): number {
  return (definition?.backoffMs ?? 0) * 2 ** (failedAttempt - 1);
}
