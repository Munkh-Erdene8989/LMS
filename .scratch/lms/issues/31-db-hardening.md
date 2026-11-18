# 31: DB hardening (RLS, FK index, function search_path)

**What to build:** Supabase security advisor-ын `rls_disabled_in_public` (ERROR, 49 хүснэгт), `unindexed_foreign_keys` ба `function_search_path_mutable` (WARN) зөвлөмжийг арилгана. Апп PostgREST ашигладаггүй (API нь Prisma-аар `postgres` эзэмшигчээр холбогдож RLS-ийг тойрно, Storage нь service role), тиймээс anon/authenticated-д бүрэн хаана.

**Blocked by:** —

**Status:** code-side done (feat/31-db-hardening) — dev/prod `public` schema-д migration deploy хийгдээгүй.

## Хийгдсэн

- [x] `20261118310000_enable_rls`: `current_schema()` дахь БҮХ хүснэгтэд (`_prisma_migrations` орно) `ENABLE ROW LEVEL SECURITY`, policy-гүй (deny-all). `FORCE` хэрэглээгүй (эзэмшигч Prisma хэвийн). `anon`/`authenticated` роль `pg_roles`-д байвал л хүснэгт/sequence/функцийн эрхийг `REVOKE ALL` хийж, `ALTER DEFAULT PRIVILEGES`-ээр ирээдүйн хүснэгтэд эрх өгөхгүй (CI Postgres-д эдгээр роль байхгүй тул алгасна). `public` хатуу бичээгүй тул тестийн `lms_test_NN` schema-д ажиллана.
- [x] `20261118310001_fk_indexes`: advisor-ын 27 FK-аас кодод бодитоор хайлт/устгалд ашиглагддаг 7-д index (`schema.prisma`-д `@@index`): `audit_logs.actor_id` (audit шүүлт), `courses.category_id` (каталог шүүлт, category устгал SetNull), `purchases.course_id`, `entitlements.course_id` (курс устгал cascade; одоогийн (user_id, course_id) index course_id-аар эхлэхгүй), `community_posts.author_id`, `community_comments.author_id`, `community_removals.user_id`.
  - Үлдсэн 20 FK (`hidden_by_id`, `reviewed_by_id`, `created_by_id`, `plan_id`, `package_id`, `referrer_id`, `document_id`, …) нь админ/ховор устгалын баганууд, кодод тэдгээрээр хайлт алга. Хэрэг гарвал нэмнэ (write overhead хэмнэв).
- [x] `20261118310002_function_search_path`: 7 trigger/helper функцэд `ALTER FUNCTION ... SET search_path FROM CURRENT`. `public` хатуу бичээгүй: migration ажиллах үеийн search_path (Prisma `?schema=`) хадгалагдана, тестийн schema-д `lms_test_31` болж тогтсон. Бүх функц SECURITY INVOKER, built-in ба дотоод хүснэгт л дууддаг тул аюулгүй.
- [x] `apps/api/test/rls.spec.ts`: schema-ийн бүх хүснэгт `relrowsecurity = true`, policy 0, FORCE RLS байхгүй, 7 функцэд `proconfig` тогтоосон. Шинэ хүснэгт RLS-гүй бол унана.
- [x] Docs: `docs/DEPLOY.md` §7 (8-р заавар): шинэ хүснэгт бүр `ENABLE ROW LEVEL SECURITY`, FK index, функцийн search_path.
- [x] `prisma migrate diff` (тестийн schema ↔ schema.prisma) хоосон: sync.

## Үлдсэн

- [ ] dev public schema-д `db:deploy` (merge-ийн дараа, гараар)
- [ ] Deploy-н дараа Supabase advisor-оор `rls_disabled_in_public`, `unindexed_foreign_keys`, `function_search_path_mutable` арилсныг шалгах; anon key-ээр PostgREST (`/rest/v1/users`) хүсэлт хоосон/403 буцаахыг шалгах
- [ ] Prod-д мөн Railway pre-deploy-оор хэрэгжинэ (`migrate:deploy:prod`); `anon`/`authenticated` эрх цуцлалт зөвхөн Supabase-д үйлчилнэ
