-- CreateTable
CREATE TABLE "assignment_submissions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "is_latest" BOOLEAN NOT NULL DEFAULT true,
    "text" TEXT,
    "file_key" TEXT,
    "file_name" TEXT,
    "file_size" INTEGER,
    "file_content_type" TEXT,
    "score" INTEGER,
    "max_score" INTEGER,
    "comment" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assignment_submissions_course_id_is_latest_reviewed_at_idx" ON "assignment_submissions"("course_id", "is_latest", "reviewed_at");

-- CreateIndex
CREATE INDEX "assignment_submissions_lesson_id_idx" ON "assignment_submissions"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_user_id_lesson_id_attempt_key" ON "assignment_submissions"("user_id", "lesson_id", "attempt");

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Утгын хүрээ (Prisma schema-д илэрхийлэгдэхгүй): текст эсвэл файлын дор хаяж нэг, файл ≤ 50MB,
-- оноо 0..max_score (үнэлсэн бол бүгд хамт).
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_content_check" CHECK ("attempt" > 0 AND ("text" IS NOT NULL OR "file_key" IS NOT NULL) AND ("file_key" IS NULL OR ("file_name" IS NOT NULL AND "file_size" BETWEEN 0 AND 52428800 AND "file_content_type" IS NOT NULL)));
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_review_check" CHECK (("reviewed_at" IS NULL AND "score" IS NULL AND "max_score" IS NULL) OR ("reviewed_at" IS NOT NULL AND "max_score" > 0 AND "score" BETWEEN 0 AND "max_score"));
