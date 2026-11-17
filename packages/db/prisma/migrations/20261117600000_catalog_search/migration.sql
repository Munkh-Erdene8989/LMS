-- Каталогийн хайлт (ticket 07): pg_trgm.
--
-- Extension нь database-д нэг л удаа, `extensions` schema-д суулгагдана (Supabase-ийн дүрэм; энгийн
-- Postgres/CI-д schema-г энд үүсгэнэ). Апп болон тест `?schema=...`-аар search_path-ийг нэг schema
-- болгодог тул pg_trgm-ийн функц, оператор, opclass-ыг үргэлж `extensions.`-ээр бүрэн нэрлэнэ
-- (apps/api/src/catalog/catalog-search.ts). Өөр schema-д (жишээ нь public) аль хэдийн суусан бол
-- `extensions` руу зөөнө — тест болон dev schema-ууд нэг database-д хамт ажиллахын тулд.
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
DECLARE
  current_schema_name text;
BEGIN
  SELECT n.nspname INTO current_schema_name
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  IF current_schema_name IS NULL THEN
    CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
  ELSIF current_schema_name <> 'extensions' THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END
$$;

-- CreateIndex
CREATE INDEX "courses_status_published_at_idx" ON "courses"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "courses_title_trgm_idx" ON "courses" USING GIN ("title" extensions.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "courses_description_trgm_idx" ON "courses" USING GIN ("description" extensions.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "teacher_applications_display_name_trgm_idx" ON "teacher_applications" USING GIN ("display_name" extensions.gin_trgm_ops);
