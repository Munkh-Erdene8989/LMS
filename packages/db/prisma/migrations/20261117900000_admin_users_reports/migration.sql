-- CreateEnum
CREATE TYPE "PaymentResolution" AS ENUM ('GRANTED', 'CLOSED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "blocked_at" TIMESTAMP(3),
ADD COLUMN "blocked_reason" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "resolved_at" TIMESTAMP(3),
ADD COLUMN "resolved_by_id" UUID,
ADD COLUMN "resolution" "PaymentResolution",
ADD COLUMN "resolution_note" TEXT;

-- Админы гар засварын idempotency (ticket 22): нэг түлхүүрээр нэг л бичилт —
-- давхар товшилт / дахин илгээлт хоёр дахь засвар үүсгэхгүй.
CREATE UNIQUE INDEX "credit_ledger_entries_admin_adjust_key"
  ON "credit_ledger_entries"("ref_id") WHERE "ref_type" = 'admin_adjust';
CREATE UNIQUE INDEX "teacher_earning_entries_admin_adjust_key"
  ON "teacher_earning_entries"("ref_id") WHERE "ref_type" = 'admin_adjust';

-- Шийдвэргүй асуудалтай төлбөрийн жагсаалт (тохирлын харагдац)
CREATE INDEX "payments_unresolved_idx" ON "payments"("status", "created_at") WHERE "resolved_at" IS NULL;
