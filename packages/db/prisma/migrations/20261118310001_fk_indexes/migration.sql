-- Supabase advisor `unindexed_foreign_keys`: бодит хайлт/устгалтад ашиглагддаг FK-үүдэд index.
-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "courses_category_id_idx" ON "courses"("category_id");

-- CreateIndex
CREATE INDEX "purchases_course_id_idx" ON "purchases"("course_id");

-- CreateIndex
CREATE INDEX "entitlements_course_id_idx" ON "entitlements"("course_id");

-- CreateIndex
CREATE INDEX "community_posts_author_id_idx" ON "community_posts"("author_id");

-- CreateIndex
CREATE INDEX "community_comments_author_id_idx" ON "community_comments"("author_id");

-- CreateIndex
CREATE INDEX "community_removals_user_id_idx" ON "community_removals"("user_id");
