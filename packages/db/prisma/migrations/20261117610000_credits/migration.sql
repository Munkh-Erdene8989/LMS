-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'AMOUNT_MISMATCH', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('CREDIT_TOPUP');

-- CreateEnum
CREATE TYPE "CreditEntryType" AS ENUM ('TOPUP', 'SUBSCRIPTION_GRANT', 'SPEND', 'EXPIRE', 'ADMIN_ADJUST');

-- CreateTable
CREATE TABLE "credit_packages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "price_mnt" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL DEFAULT 'CREDIT_TOPUP',
    "package_id" UUID,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount_mnt" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "credit_price_mnt" INTEGER NOT NULL,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "callback_token" TEXT NOT NULL,
    "provider_invoice_id" TEXT,
    "provider_payment_id" TEXT,
    "qr_text" TEXT,
    "qr_image" TEXT,
    "short_url" TEXT,
    "deeplinks" JSONB NOT NULL DEFAULT '[]',
    "paid_amount_mnt" INTEGER,
    "paid_at" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_lots" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "CreditEntryType" NOT NULL,
    "initial" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "expired_at" TIMESTAMP(3),
    "payment_id" UUID,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "CreditEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "actor_id" UUID,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "payment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_allocations" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "credit_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_packages_active_position_idx" ON "credit_packages"("active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "payments_callback_token_key" ON "payments"("callback_token");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_invoice_id_key" ON "payments"("provider_invoice_id");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "credit_lots_payment_id_key" ON "credit_lots"("payment_id");

-- CreateIndex
CREATE INDEX "credit_lots_user_id_expires_at_idx" ON "credit_lots"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "credit_lots_expires_at_remaining_idx" ON "credit_lots"("expires_at", "remaining");

-- CreateIndex
CREATE INDEX "credit_ledger_entries_user_id_created_at_id_idx" ON "credit_ledger_entries"("user_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "credit_ledger_entries_type_created_at_idx" ON "credit_ledger_entries"("type", "created_at");

-- CreateIndex
CREATE INDEX "credit_ledger_entries_ref_type_ref_id_idx" ON "credit_ledger_entries"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "credit_allocations_entry_id_idx" ON "credit_allocations"("entry_id");

-- CreateIndex
CREATE INDEX "credit_allocations_lot_id_idx" ON "credit_allocations"("lot_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "credit_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "credit_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "credit_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Мөнгөний хамгаалалт (DB түвшинд): lot сөрөг болохгүй, дүн эерэг.
ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_remaining_check" CHECK ("remaining" >= 0 AND "remaining" <= "initial" AND "initial" > 0);
ALTER TABLE "credit_packages" ADD CONSTRAINT "credit_packages_amounts_check" CHECK ("credits" > 0 AND "price_mnt" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amounts_check" CHECK ("credits" > 0 AND "amount_mnt" > 0);
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_amount_check" CHECK ("amount" <> 0);

-- Админд л харагдах 100₮ туршилтын багц (production-д QPay-г бодит жижиг төлбөрөөр шалгах).
INSERT INTO "credit_packages" ("id", "name", "credits", "price_mnt", "active", "is_test", "position", "updated_at")
VALUES (gen_random_uuid(), 'Туршилт (100₮)', 1, 100, true, true, 999, CURRENT_TIMESTAMP);
