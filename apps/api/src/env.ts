import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

/** Local хөгжүүлэлтэд monorepo-ийн root `.env`-ийг уншина. Production-д env-ийг платформ (Railway) өгнө. */
export function loadDotenv(): void {
  const rootEnv = resolve(__dirname, '../../../.env');
  if (existsSync(rootEnv)) config({ path: rootEnv, quiet: true });
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL шаардлагатай'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET дор хаяж 32 тэмдэгт байх ёстой'),
  /** Байхгүй бол (dev) fake adapter ашиглаж, кодыг консолд хэвлэнэ. Production-д заавал. */
  VERIFY_MN_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('LMS <onboarding@resend.dev>'),
  /**
   * Browser API-г web-ийн proxy-оор (`/api/*` → API) дууддаг тул refresh cookie-ийн path-д
   * энэ угтварыг нэмнэ (жишээ нь `/api` → `Path=/api/auth`). API-г шууд дуудвал хоосон.
   */
  COOKIE_PATH_PREFIX: z.string().regex(/^(\/[\w-]+)*$/).default(''),
  /** Express `trust proxy`: API-ийн өмнөх proxy hop-ын тоо (rate limit-ийн client IP-д). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  /** BullMQ дараалал. Байхгүй бол (dev) process доторх дараалал, cron ажиллахгүй. Production-д заавал. */
  REDIS_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  /** Энэ process арын ажлыг гүйцэтгэх эсэх (дараа нь тусдаа worker service болговол `false`). */
  WORKERS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Supabase Storage (PDF, зураг). Байхгүй бол dev-д local диск (`apps/api/.storage`). Production-д заавал. */
  SUPABASE_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  /** Имэйл дэх линкүүдийн суурь хаяг */
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  /** QPay merchant v2 (https://developer.qpay.mn). Байхгүй бол dev-д fake (нэхэмжлэх шууд төлөгдсөнд тооцно). Production-д заавал. */
  QPAY_CLIENT_ID: z.string().optional(),
  QPAY_CLIENT_SECRET: z.string().optional(),
  QPAY_INVOICE_CODE: z.string().optional(),
  QPAY_BASE_URL: z.string().url().default('https://merchant.qpay.mn'),
  /** QPay callback хүрэх нийтийн API хаяг. Хоосон бол `PUBLIC_WEB_URL` + `/api` (web proxy-оор). */
  QPAY_CALLBACK_BASE_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  for (const key of [
    'VERIFY_MN_API_KEY',
    'RESEND_API_KEY',
    'REDIS_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'QPAY_CLIENT_ID',
    'QPAY_CLIENT_SECRET',
    'QPAY_INVOICE_CODE',
  ] as const) {
    if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'production-д шаардлагатай' });
  }
});

/** DI token: parse хийсэн орчны хувьсагчид. */
export const ENV = Symbol('ENV');

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Орчны хувьсагч буруу:\n${issues}`);
  }
  return result.data;
}
