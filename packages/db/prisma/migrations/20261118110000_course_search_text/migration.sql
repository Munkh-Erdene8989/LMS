-- Каталогийн хайлт (ticket 07 "Үлдсэн"): денормчилсон `courses.search_text`.
--
-- Өмнө нь хайлт title / description / багшийн нэр гурван баганад OR-оор хийгдэж, GIN index-үүдийг
-- бүрэн ашигладаггүй байв. Одоо гурвыг нэг баганад (`title \n description \n багшийн нэр`) нэгтгэж,
-- ганц trigram GIN index тавина. Багшийн нийтийн нэр = APPROVED өргөдлийн display_name, байхгүй бол users.name.
-- Мөр тусгаарлагч нь "\n": хайлтын текст дахь зайг нэг space болгон нормчилдог тул талбар дамнан давхар таарахгүй.
-- Багана DB trigger-ээр синк хийгдэнэ — ямар ч код зам (service, admin, seed, CLI) мартаж чадахгүй.
-- Trigger функцүүд table-ийг нэргүй (search_path-аар) дууддаг: апп/тест `?schema=`-аар search_path-ийг нэг schema болгодог.

ALTER TABLE "courses" ADD COLUMN "search_text" TEXT NOT NULL DEFAULT '';

CREATE FUNCTION course_search_text(p_title text, p_description text, p_teacher_id uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(p_title, '') || E'\n' || COALESCE(p_description, '') || E'\n' || COALESCE(
    (SELECT ta.display_name FROM teacher_applications ta WHERE ta.user_id = p_teacher_id AND ta.status = 'APPROVED'),
    (SELECT u.name FROM users u WHERE u.id = p_teacher_id),
    ''
  )
$$;

CREATE FUNCTION courses_set_search_text() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_text := course_search_text(NEW.title, NEW.description, NEW.teacher_id);
  RETURN NEW;
END
$$;

CREATE FUNCTION courses_refresh_search_text_for_teacher(p_teacher_id uuid) RETURNS void
LANGUAGE sql AS $$
  UPDATE courses SET search_text = course_search_text(title, description, teacher_id) WHERE teacher_id = p_teacher_id
$$;

CREATE FUNCTION users_refresh_course_search_text() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM courses_refresh_search_text_for_teacher(NEW.id);
  RETURN NULL;
END
$$;

CREATE FUNCTION teacher_applications_refresh_course_search_text() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM courses_refresh_search_text_for_teacher(OLD.user_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    PERFORM courses_refresh_search_text_for_teacher(NEW.user_id);
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER courses_search_text_trg
  BEFORE INSERT OR UPDATE OF title, description, teacher_id ON "courses"
  FOR EACH ROW EXECUTE FUNCTION courses_set_search_text();

CREATE TRIGGER users_course_search_text_trg
  AFTER UPDATE OF name ON "users"
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION users_refresh_course_search_text();

CREATE TRIGGER teacher_applications_course_search_text_trg
  AFTER INSERT OR DELETE OR UPDATE OF display_name, status, user_id ON "teacher_applications"
  FOR EACH ROW EXECUTE FUNCTION teacher_applications_refresh_course_search_text();

-- Backfill
UPDATE "courses" SET "search_text" = course_search_text("title", "description", "teacher_id");

-- Нэг GIN index; хуучин гурван trigram index-ийг орлоно.
DROP INDEX "courses_title_trgm_idx";
DROP INDEX "courses_description_trgm_idx";
DROP INDEX "teacher_applications_display_name_trgm_idx";
CREATE INDEX "courses_search_text_trgm_idx" ON "courses" USING GIN ("search_text" extensions.gin_trgm_ops);
