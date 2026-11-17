-- CreateEnum
CREATE TYPE "PurchaseKind" AS ENUM ('LESSON', 'COURSE');

-- CreateEnum
CREATE TYPE "PurchaseAttribution" AS ENUM ('PLATFORM', 'REFERRAL');

-- CreateEnum
CREATE TYPE "TeacherEarningType" AS ENUM ('SALE_EARNING', 'PAYOUT', 'ADMIN_ADJUST');

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID,
    "teacher_id" UUID NOT NULL,
    "kind" "PurchaseKind" NOT NULL,
    "list_credits" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "credit_price_mnt" INTEGER NOT NULL,
    "commission_percent" INTEGER NOT NULL,
    "attribution" "PurchaseAttribution" NOT NULL DEFAULT 'PLATFORM',
    "referrer_id" UUID,
    "credit_entry_id" UUID,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_entitlements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_earning_entries" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "type" "TeacherEarningType" NOT NULL,
    "amount_mnt" INTEGER NOT NULL,
    "purchase_id" UUID,
    "credits" INTEGER,
    "credit_price_mnt" INTEGER,
    "commission_percent" INTEGER,
    "gross_mnt" INTEGER,
    "attribution" "PurchaseAttribution",
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "actor_id" UUID,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_earning_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchases_credit_entry_id_key" ON "purchases"("credit_entry_id");

-- CreateIndex
CREATE INDEX "purchases_user_id_created_at_idx" ON "purchases"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "purchases_user_id_course_id_idx" ON "purchases"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "purchases_teacher_id_created_at_idx" ON "purchases"("teacher_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "purchases_lesson_id_idx" ON "purchases"("lesson_id");

-- CreateIndex
CREATE INDEX "entitlements_user_id_course_id_idx" ON "entitlements"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "entitlements_lesson_id_idx" ON "entitlements"("lesson_id");

-- CreateIndex
CREATE INDEX "entitlements_purchase_id_idx" ON "entitlements"("purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_user_id_lesson_id_key" ON "entitlements"("user_id", "lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_entitlements_purchase_id_key" ON "course_entitlements"("purchase_id");

-- CreateIndex
CREATE INDEX "course_entitlements_course_id_idx" ON "course_entitlements"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_entitlements_user_id_course_id_key" ON "course_entitlements"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "teacher_earning_entries_teacher_id_created_at_id_idx" ON "teacher_earning_entries"("teacher_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "teacher_earning_entries_purchase_id_idx" ON "teacher_earning_entries"("purchase_id");

-- CreateIndex
CREATE INDEX "teacher_earning_entries_type_created_at_idx" ON "teacher_earning_entries"("type", "created_at");

-- CreateIndex
CREATE INDEX "teacher_earning_entries_ref_type_ref_id_idx" ON "teacher_earning_entries"("ref_type", "ref_id");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_entitlements" ADD CONSTRAINT "course_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_entitlements" ADD CONSTRAINT "course_entitlements_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_entitlements" ADD CONSTRAINT "course_entitlements_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_earning_entries" ADD CONSTRAINT "teacher_earning_entries_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_earning_entries" ADD CONSTRAINT "teacher_earning_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_earning_entries" ADD CONSTRAINT "teacher_earning_entries_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Мөнгөний хамгаалалт (DB түвшинд): бүхэл, сөрөг биш дүн; хувь 0–100; төрөл ба холбоос нийцтэй.
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_amounts_check"
  CHECK ("credits" >= 0 AND "list_credits" >= 0 AND "credit_price_mnt" > 0 AND "commission_percent" BETWEEN 0 AND 100);
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_kind_lesson_check"
  CHECK (("kind" = 'LESSON') = ("lesson_id" IS NOT NULL));
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_referral_check"
  CHECK (("attribution" = 'REFERRAL') = ("referrer_id" IS NOT NULL));
ALTER TABLE "teacher_earning_entries" ADD CONSTRAINT "teacher_earning_entries_amount_check"
  CHECK ("amount_mnt" <> 0);
ALTER TABLE "teacher_earning_entries" ADD CONSTRAINT "teacher_earning_entries_sale_check"
  CHECK ("type" <> 'SALE_EARNING' OR ("purchase_id" IS NOT NULL AND "amount_mnt" > 0 AND "credits" > 0
    AND "credit_price_mnt" > 0 AND "commission_percent" BETWEEN 0 AND 100 AND "gross_mnt" >= "amount_mnt"));
