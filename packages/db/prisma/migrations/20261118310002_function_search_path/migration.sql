-- Supabase advisor `function_search_path_mutable`: trigger функцүүдийн search_path-ийг тогтооно.
-- `public`-ыг хатуу бичихгүй: тест `lms_test_NN` schema-д migrate хийдэг тул `FROM CURRENT` ашиглана —
-- migration ажиллах үеийн search_path (Prisma `?schema=`-аар тухайн schema) функцэд хадгалагдана.
-- Бүх функц SECURITY INVOKER, зөвхөн дотоод хүснэгтүүд болон built-in-ийг дууддаг.
DO $$
DECLARE
  s text := current_schema();
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = s::regnamespace
      AND p.proname IN (
        'certificates_immutable',
        'lesson_videos_enqueue_mux_orphan',
        'course_search_text',
        'courses_set_search_text',
        'courses_refresh_search_text_for_teacher',
        'users_refresh_course_search_text',
        'teacher_applications_refresh_course_search_text'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path FROM CURRENT', r.sig);
  END LOOP;
END
$$;
