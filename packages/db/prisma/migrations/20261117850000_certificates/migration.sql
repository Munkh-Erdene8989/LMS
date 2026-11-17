-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "course_title" TEXT NOT NULL,
    "teacher_name" TEXT NOT NULL,
    "quiz_average_percent" INTEGER,
    "lesson_count" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_code_key" ON "certificates"("code");

-- CreateIndex
CREATE INDEX "certificates_course_id_idx" ON "certificates"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_user_id_course_id_key" ON "certificates"("user_id", "course_id");

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Утгын хязгаар
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_code_format_check" CHECK ("code" ~ '^[A-HJ-NP-Z2-9]{16}$');
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_quiz_average_percent_check" CHECK ("quiz_average_percent" IS NULL OR "quiz_average_percent" BETWEEN 0 AND 100);
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_lesson_count_check" CHECK ("lesson_count" >= 1);

-- Олгогдсон сертификат өөрчлөгдөхгүй (verify код, нэр, огноо тогтмол)
CREATE FUNCTION "certificates_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'certificates are immutable';
END;
$$;

CREATE TRIGGER "certificates_no_update" BEFORE UPDATE ON "certificates"
  FOR EACH ROW EXECUTE FUNCTION "certificates_immutable"();
