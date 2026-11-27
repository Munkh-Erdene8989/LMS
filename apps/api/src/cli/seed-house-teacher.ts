/**
 * House teacher (платформын брэнд нэртэй TEACHER аккаунт) үүсгэнэ — дахин ажиллуулахад аюулгүй:
 *   pnpm --filter @lms/api house-teacher:seed                    # аккаунт үүсгэх / баталгаажуулах
 *   pnpm --filter @lms/api house-teacher:seed ner@example.mn     # + энэ утас/имэйлээр нэвтрэх боломжтой болгох
 * Production: Railway → API service → shell дээр `node dist/cli/seed-house-teacher.js [identifier]`.
 */
import { PrismaClient } from '@lms/db';
import { loadDotenv } from '../env';
import { ensureHouseTeacher, HouseTeacherError } from '../organizations/house-teacher';

async function main(): Promise<void> {
  loadDotenv();
  const prisma = new PrismaClient();
  try {
    const { userId, created } = await ensureHouseTeacher(prisma, { identifier: process.argv[2] });
    console.log(created ? `✓ House teacher үүслээ (user ${userId})` : `House teacher аль хэдийн байна (user ${userId})`);
  } catch (err) {
    if (err instanceof HouseTeacherError) {
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
