-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED');

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "amount_mnt" INTEGER NOT NULL,
    "bank" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "processed_by_id" UUID,
    "transfer_ref" TEXT,
    "reject_reason" TEXT,
    "earning_entry_id" UUID,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_holds" (
    "teacher_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_holds_pkey" PRIMARY KEY ("teacher_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payouts_earning_entry_id_key" ON "payouts"("earning_entry_id");

-- CreateIndex
CREATE INDEX "payouts_status_requested_at_idx" ON "payouts"("status", "requested_at");

-- CreateIndex
CREATE INDEX "payouts_teacher_id_requested_at_id_idx" ON "payouts"("teacher_id", "requested_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_earning_entry_id_fkey" FOREIGN KEY ("earning_entry_id") REFERENCES "teacher_earning_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_holds" ADD CONSTRAINT "payout_holds_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_holds" ADD CONSTRAINT "payout_holds_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Мөнгөний хамгаалалт (DB түвшинд, ticket 20).
-- Багш бүрт нэг л нээлттэй хүсэлт — зэрэг хүсэлтийн сүүлчийн хамгаалалт.
CREATE UNIQUE INDEX "payouts_one_open_per_teacher" ON "payouts"("teacher_id") WHERE "status" = 'REQUESTED';

-- Дүн эерэг; төлөв ба талбарууд нийцтэй: PAID ⇔ ledger бичилттэй, REJECTED ⇔ шалтгаантай, нээлттэй ⇔ processed_at алга.
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_amount_check" CHECK ("amount_mnt" > 0);
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_status_check" CHECK (
  (("status" = 'REQUESTED') = ("processed_at" IS NULL))
  AND (("status" = 'PAID') = ("earning_entry_id" IS NOT NULL))
  AND (("status" = 'REJECTED') = ("reject_reason" IS NOT NULL))
);

-- PAYOUT бичилт сөрөг, эх хүсэлттэй; нэг хүсэлтэд нэг л PAYOUT бичилт (давхар төлөлтөөс сэргийлнэ).
ALTER TABLE "teacher_earning_entries" ADD CONSTRAINT "teacher_earning_entries_payout_check"
  CHECK ("type" <> 'PAYOUT' OR ("amount_mnt" < 0 AND "ref_type" = 'payout' AND "ref_id" IS NOT NULL));
CREATE UNIQUE INDEX "teacher_earning_entries_payout_ref_key" ON "teacher_earning_entries"("ref_id") WHERE "type" = 'PAYOUT';
