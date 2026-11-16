import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { testDatabaseUrl } from './test-db-url';

/** Бүх тестийн өмнө нэг удаа: тестийн schema-д migration-уудыг хэрэгжүүлнэ. */
export default async function globalSetup(): Promise<void> {
  const url = testDatabaseUrl();
  const schema = resolve(__dirname, '../../../packages/db/prisma/schema.prisma');
  execSync(`pnpm exec prisma migrate deploy --schema "${schema}"`, {
    cwd: resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
