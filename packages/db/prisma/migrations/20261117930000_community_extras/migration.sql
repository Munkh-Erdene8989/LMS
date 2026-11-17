-- AlterTable
ALTER TABLE "community_posts" ADD COLUMN "edited_at" TIMESTAMP(3),
ADD COLUMN "hidden_at" TIMESTAMP(3),
ADD COLUMN "hidden_by_id" UUID,
ADD COLUMN "hidden_reason" TEXT;

-- AlterTable
ALTER TABLE "community_comments" ADD COLUMN "edited_at" TIMESTAMP(3),
ADD COLUMN "hidden_at" TIMESTAMP(3),
ADD COLUMN "hidden_by_id" UUID,
ADD COLUMN "hidden_reason" TEXT;

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","category")
);

-- CreateIndex
CREATE INDEX "community_posts_created_at_id_idx" ON "community_posts"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "community_comments_created_at_id_idx" ON "community_comments"("created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_hidden_by_id_fkey" FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_hidden_by_id_fkey" FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
