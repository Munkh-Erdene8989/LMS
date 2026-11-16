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
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Орчны хувьсагч буруу:\n${issues}`);
  }
  return result.data;
}
