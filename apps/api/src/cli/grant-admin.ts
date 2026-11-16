/**
 * Эхний (эсвэл нэмэлт) админыг үүсгэнэ:
 *   pnpm --filter @lms/api admin:grant 99112233
 *   pnpm --filter @lms/api admin:grant ner@example.mn
 * Хэрэглэгч эхлээд тэр утас/имэйлээр нэг удаа нэвтэрсэн байх ёстой.
 * Production: Railway → API service → shell дээр `node dist/cli/grant-admin.js <identifier>`.
 */
import { PrismaClient } from '@lms/db';
import { loadDotenv } from '../env';
import { grantRoleByIdentifier, GrantRoleError } from '../admin/roles';

async function main(): Promise<void> {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error('Хэрэглээ: admin:grant <утас|имэйл>');
    process.exit(2);
  }
  loadDotenv();
  const prisma = new PrismaClient();
  try {
    const result = await grantRoleByIdentifier(prisma, identifier, 'ADMIN');
    console.log(
      result.changed
        ? `✓ ADMIN эрх олголоо (user ${result.userId}; roles: ${result.roles.join(', ')})`
        : `Аль хэдийн ADMIN (user ${result.userId})`,
    );
  } catch (err) {
    if (err instanceof GrantRoleError) {
      console.error(`✗ ${err.message}`);
      process.exitCode = 1;
    } else {
      throw err;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
