-- Supabase `public` схемийг PostgREST-ээр anon/authenticated рольд нээдэг. Апп PostgREST ашигладаггүй
-- (API нь Prisma-аар `postgres` эзэмшигчээр холбогдоно, эзэмшигч RLS-ийг тойрно; Storage нь service role).
-- Тиймээс RLS-ийг policy-гүйгээр идэвхжүүлж (deny-all), anon/authenticated-ийн эрхийг цуцлана.
-- FORCE RLS ХЭРЭГЛЭХГҮЙ: эзэмшигчид нөлөөлнө. Схемийг current_schema()-аар тодорхойлно (тестийн lms_test_NN-д ч ажиллана).
DO $$
DECLARE
  s text := current_schema();
  r record;
  rl text;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = s LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', s, r.tablename);
  END LOOP;

  -- Supabase-ийн бус Postgres (CI)-д эдгээр роль байхгүй тул зөвхөн байвал.
  FOREACH rl IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rl) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', s, rl);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I', s, rl);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM %I', s, rl);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM %I', s, rl);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM %I', s, rl);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM %I', s, rl);
    END IF;
  END LOOP;
END
$$;
