-- CreateEnum
CREATE TYPE "TeacherApplicationStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "teacher_applications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "TeacherApplicationStatus" NOT NULL,
    "display_name" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "expertise" TEXT NOT NULL,
    "sample_url" TEXT NOT NULL,
    "agreement_acceptance_id" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "review_note" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bank" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_applications_user_id_key" ON "teacher_applications"("user_id");

-- CreateIndex
CREATE INDEX "teacher_applications_status_submitted_at_idx" ON "teacher_applications"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_user_id_key" ON "bank_accounts"("user_id");

-- AddForeignKey
ALTER TABLE "teacher_applications" ADD CONSTRAINT "teacher_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_applications" ADD CONSTRAINT "teacher_applications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_applications" ADD CONSTRAINT "teacher_applications_agreement_acceptance_id_fkey" FOREIGN KEY ("agreement_acceptance_id") REFERENCES "legal_acceptances"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

