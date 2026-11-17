-- Ticket 11: багшийн referral код ба (хэрэглэгч, багш) attribution бичлэг.

-- CreateTable
CREATE TABLE "referral_codes" (
    "teacher_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("teacher_id")
);

-- CreateTable
CREATE TABLE "referral_attributions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE INDEX "referral_attributions_teacher_id_last_seen_at_idx" ON "referral_attributions"("teacher_id", "last_seen_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "referral_attributions_user_id_teacher_id_key" ON "referral_attributions"("user_id", "teacher_id");

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Raw SQL (Prisma CHECK-ийг загварчилдаггүй)
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_code_check"
  CHECK ("code" ~ '^[a-z0-9]{6,32}$');
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_self_check"
  CHECK ("user_id" <> "teacher_id");
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_seen_check"
  CHECK ("first_seen_at" <= "last_seen_at");
-- Referral шимтгэл зөвхөн урьсан багшийн өөрийн курст
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_referrer_teacher_check"
  CHECK ("referrer_id" IS NULL OR "referrer_id" = "teacher_id");
