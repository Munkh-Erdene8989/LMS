# 33b: Түр demo өгөгдөл (зөвхөн харуулах)

**What to build:** Хоосон DB-тэй үед ч redesign-ийг дүүрэн харах боломжтой түр demo өгөгдөл. Хэрэглэгчийн хүсэлт. Хожим бүрэн устгана.

**Blocked by:** 32 (33-тай зэрэгцэж болно)

**Status:** todo

## Хийх
- [ ] `apps/web/lib/demo/data.ts`: `@lms/shared`-ийн бодит type-уудаар (`CatalogPage`, `CategoryNode`, `PublicCourseDetail`, `PublicTeacherProfile`, `CourseReviewPage`, credit package / subscription plan / community / notification / ledger / teacher earnings-ийн type) монгол бодит маягийн өгөгдөл: 6 ангилал, 5 багш, 12 курс (section/lesson, lesson үнэ кр, курсийн бүтэн үнэ хямдралтай, үнэлгээ, сэтгэгдэл), 3 credit package, 2 subscription plan, community post/comment, мэдэгдэл, гүйлгээ, багшийн орлого/analytics цуваа. ID-ууд `demo-` угтвартай.
- [ ] Cover зураг: `coverUrl: null` + курсийн `id`-аас тодорхойлогдох gradient (`lib/demo/cover.ts` эсвэл course card-ийн fallback gradient) — гадны зураг ХОРИОТОЙ (CSP).
- [ ] `apps/web/lib/demo/index.ts`: `DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_DATA === '1'` (build-time inline — флаггүй build-д dead code). `demoFor(path): unknown | undefined` — API path → fixture.
- [ ] Залгах цэг (НЭГ газар): `lib/catalog.ts` `getPublic` (server) ба `lib/client-api.ts` `api()` (зөвхөн GET) — `DEMO_ENABLED` бөгөөд хариу хоосон/алдаатай/сүлжээ унасан бол `demoFor(path)`. `demo-` ID-тай mutation → `{ ok:false }` + мессеж «Demo курс — худалдан авах боломжгүй».
- [ ] `apps/web/app/ui/demo-badge.tsx`: `DEMO_ENABLED` үед доод буланд жижиг «Demo өгөгдөл» badge (root layout).
- [ ] `apps/web/.env.example`-д `NEXT_PUBLIC_DEMO_DATA=` (тайлбартай). Production (Vercel) env-д тавихгүй гэж тэмдэглэх.
- [ ] Энэ файлын доор «Устгах заавар» хэсэг бичих (хавтас + 2 залгах цэг + badge + env).

## Шалгах
- typecheck, build ногоон. `NEXT_PUBLIC_DEMO_DATA` флаггүй `build`-ийн дараа `grep -r "demo-course" apps/web/.next/static` = 0.
