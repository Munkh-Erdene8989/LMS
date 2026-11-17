-- CreateTable
CREATE TABLE "community_posts" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "image_key" TEXT,
    "pinned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_comments" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_likes" (
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_likes_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateTable
CREATE TABLE "community_removals" (
    "teacher_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_removals_pkey" PRIMARY KEY ("teacher_id","user_id")
);

-- CreateIndex
CREATE INDEX "community_posts_teacher_id_created_at_id_idx" ON "community_posts"("teacher_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "community_posts_teacher_id_pinned_at_idx" ON "community_posts"("teacher_id", "pinned_at");

-- CreateIndex
CREATE INDEX "community_comments_post_id_created_at_id_idx" ON "community_comments"("post_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "community_likes_user_id_idx" ON "community_likes"("user_id");

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_likes" ADD CONSTRAINT "community_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_likes" ADD CONSTRAINT "community_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_removals" ADD CONSTRAINT "community_removals_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_removals" ADD CONSTRAINT "community_removals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_removals" ADD CONSTRAINT "community_removals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Утгын хязгаар (API-ийн `COMMUNITY_*_MAX`-тай ижил)
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_body_length_check" CHECK (char_length("body") <= 5000);
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_not_empty_check" CHECK ("body" <> '' OR "image_key" IS NOT NULL);
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_body_check" CHECK (char_length("body") BETWEEN 1 AND 2000);
ALTER TABLE "community_removals" ADD CONSTRAINT "community_removals_not_self_check" CHECK ("teacher_id" <> "user_id");
