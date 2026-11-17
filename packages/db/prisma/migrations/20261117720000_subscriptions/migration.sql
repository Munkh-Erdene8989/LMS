-- Subscription (ticket 17): сарын багц, төлөв, үе бүрийн олголт, холбосон карт (зөвхөн токен).

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('INVOICE', 'CARD');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentCardStatus" AS ENUM ('PENDING', 'ACTIVE');

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'SUBSCRIPTION';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELED';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "method" "PaymentMethod" NOT NULL DEFAULT 'INVOICE',
ADD COLUMN     "plan_id" UUID,
ADD COLUMN     "renewal_for" TIMESTAMP(3),
ADD COLUMN     "subscription_id" UUID;

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_mnt" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "past_due_since" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_periods" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "credits" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_cards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "PaymentCardStatus" NOT NULL DEFAULT 'PENDING',
    "registration_id" TEXT NOT NULL,
    "token" TEXT,
    "masked_pan" TEXT,
    "brand" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_plans_active_position_idx" ON "subscription_plans"("active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE INDEX "subscriptions_status_past_due_since_idx" ON "subscriptions"("status", "past_due_since");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_periods_payment_id_key" ON "subscription_periods"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_periods_subscription_id_starts_at_key" ON "subscription_periods"("subscription_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_cards_user_id_key" ON "payment_cards"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_cards_registration_id_key" ON "payment_cards"("registration_id");

-- CreateIndex
CREATE INDEX "payments_subscription_id_status_idx" ON "payments"("subscription_id", "status");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_cards" ADD CONSTRAINT "payment_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Мөнгөн дүн, кредит эерэг; үе нь хоосон биш.
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_amounts_check" CHECK ("credits" > 0 AND "price_mnt" > 0);
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_range_check" CHECK ("ends_at" > "starts_at" AND "credits" > 0);

-- Нэг сунгалтын үед (subscription, renewal_for) нээлттэй/төлөгдсөн нэхэмжлэх нэгээс илүү үүсэхгүй —
-- давхар cron, давхар "Төлөх" дарах. Prisma partial index-ийг илэрхийлэхгүй тул энд (GIN индексүүд шиг).
CREATE UNIQUE INDEX "payments_subscription_renewal_invoice_key" ON "payments"("subscription_id", "renewal_for")
  WHERE "method" = 'INVOICE' AND "renewal_for" IS NOT NULL AND "status" IN ('PENDING', 'PAID');
