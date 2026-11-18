import { PrismaClient } from '@lms/db';
import { testDatabaseUrl } from './test-db-url';

jest.setTimeout(120_000);

/**
 * Ticket 31: Supabase `public` нь PostgREST-ээр anon/authenticated-д нээлттэй тул бүх хүснэгтэд RLS (policy-гүй,
 * deny-all) идэвхтэй байх ёстой. Шинэ хүснэгт нэмэхдээ migration-д `ENABLE ROW LEVEL SECURITY` бичээгүй бол энд унана.
 */
describe('Row Level Security', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
  afterAll(() => prisma.$disconnect());

  it('тестийн schema-ийн бүх хүснэгт (`_prisma_migrations` орно) relrowsecurity = true', async () => {
    const rows = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relnamespace = current_schema()::regnamespace AND relkind IN ('r', 'p')
      ORDER BY relname`;
    expect(rows.length).toBeGreaterThan(40);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it('policy байхгүй (deny-all), FORCE RLS биш (эзэмшигч Prisma ажиллана)', async () => {
    const [{ policies }] = await prisma.$queryRaw<{ policies: number }[]>`
      SELECT count(*)::int AS policies FROM pg_policies WHERE schemaname = current_schema()`;
    expect(policies).toBe(0);
    const forced = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT relname FROM pg_class
      WHERE relnamespace = current_schema()::regnamespace AND relkind = 'r' AND relforcerowsecurity`;
    expect(forced).toEqual([]);
  });

  it('trigger функцүүдийн search_path тогтоогдсон (function_search_path_mutable)', async () => {
    const rows = await prisma.$queryRaw<{ proname: string }[]>`
      SELECT proname FROM pg_proc
      WHERE pronamespace = current_schema()::regnamespace
        AND proname IN ('certificates_immutable', 'lesson_videos_enqueue_mux_orphan', 'course_search_text',
                        'courses_set_search_text', 'courses_refresh_search_text_for_teacher',
                        'users_refresh_course_search_text', 'teacher_applications_refresh_course_search_text')
        AND proconfig IS NULL`;
    expect(rows).toEqual([]);
  });
});
