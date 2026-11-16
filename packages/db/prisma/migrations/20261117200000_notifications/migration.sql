-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('NONE', 'QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "email_status" "EmailStatus" NOT NULL DEFAULT 'NONE',
    "email_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_id_idx" ON "notifications"("user_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

