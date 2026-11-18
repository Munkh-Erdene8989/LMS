# 33b: Түр demo өгөгдөл (зөвхөн харуулах)

**What to build:** Хоосон DB-тэй үед ч redesign-ийг дүүрэн харах боломжтой түр demo өгөгдөл. Хэрэглэгчийн хүсэлт. Хожим бүрэн устгана.

**Blocked by:** 32 (33-тай зэрэгцэж болно)

**Status:** done (feat/33b-demo-data)

## Хийх
- [x] `apps/web/lib/demo/data.ts`: `@lms/shared`-ийн бодит type-уудаар (`CatalogPage`, `CategoryNode`, `PublicCourseDetail`, `PublicTeacherProfile`, `CourseReviewPage`, credit package / subscription plan / community / notification / ledger / teacher earnings-ийн type) монгол бодит маягийн өгөгдөл: 6 ангилал, 5 багш, 12 курс (section/lesson, lesson үнэ кр, курсийн бүтэн үнэ хямдралтай, үнэлгээ, сэтгэгдэл), 3 credit package, 2 subscription plan, community post/comment, мэдэгдэл, гүйлгээ, багшийн орлого/analytics цуваа. ID-ууд `demo-` угтвартай.
- [x] Cover зураг: `coverUrl: null` + курсийн `id`-аас тодорхойлогдох gradient (`lib/demo/cover.ts` эсвэл course card-ийн fallback gradient) — гадны зураг ХОРИОТОЙ (CSP).
- [x] `apps/web/lib/demo/index.ts`: `DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_DATA === '1'` (build-time inline — флаггүй build-д dead code). `demoFor(path): unknown | undefined` — API path → fixture.
- [x] Залгах цэг (НЭГ газар): `lib/catalog.ts` `getPublic` (server) ба `lib/client-api.ts` `api()` (зөвхөн GET) — `DEMO_ENABLED` бөгөөд хариу хоосон/алдаатай/сүлжээ унасан бол `demoFor(path)`. `demo-` ID-тай mutation → `{ ok:false }` + мессеж «Demo курс — худалдан авах боломжгүй».
- [x] `apps/web/app/ui/demo-badge.tsx`: `DEMO_ENABLED` үед доод буланд жижиг «Demo өгөгдөл» badge (root layout).
- [x] `apps/web/.env.example`-д `NEXT_PUBLIC_DEMO_DATA=` (тайлбартай). Production (Vercel) env-д тавихгүй гэж тэмдэглэх.
- [x] Энэ файлын доор «Устгах заавар» хэсэг бичих (хавтас + 2 залгах цэг + badge + env).

## Шалгах
- typecheck, build ногоон. `NEXT_PUBLIC_DEMO_DATA` флаггүй `build`-ийн дараа `grep -r "demo-course" apps/web/.next/static` = 0.

## Хэрэгжүүлэлтийн тэмдэглэл
- `DEMO_ENABLED` нь `lib/demo/index.ts`-д байгаа ч залгах цэгүүд (`catalog.ts`, `client-api.ts`, `demo-badge.tsx`) модулийн тогтмолыг import хийхгүй: `process.env.NEXT_PUBLIC_DEMO_DATA === '1'`-ийг шууд шалгаад салбар дотроо `await import('./demo')` хийнэ. Модулийн тогтмол import хийвэл bundler cross-module тогтмол шингээхгүй тул demo (data.ts-ийн top-level) bundle-д үлддэг байсан.
- `next.config.ts`-д `env: { NEXT_PUBLIC_DEMO_DATA: ... ?? '' }` — флаг unset үед ч тогтмол болгож шингээхэд ЗАВАЛ (үгүй бол dead-code хасагдахгүй).
- `fetchCatalog` одоо `getPublic`-аар дамжина (өмнө шууд fetch хийдэг байсан).
- Mutation: `api()` нь path/body-д `demo-` агуулбал `ApiRequestError(400, { code: 'DEMO_READONLY', message: 'Demo курс — худалдан авах боломжгүй' })` шиднэ.
- Хамрах GET path: `/categories`, `/catalog/courses[?q,category,level,minPrice,maxPrice,minRating,freePreview,sort,page,pageSize]`, `/catalog/courses/:id`, `/catalog/courses/:id/reviews`, `/catalog/teachers/:id`, `/credits`, `/credits/packages`, `/credits/history`, `/subscription`, `/subscription/plans`, `/notifications`, `/notifications/unread-count`, `/communities`, `/communities/:teacherId`, `/communities/:teacherId/posts`, `/community/posts/:id/comments`, `/teacher/earnings`, `/teacher/payouts`, `/teacher/analytics?from&to&granularity`, `/teacher/community/members`. Хамрагдаагүй: `/catalog/lessons/:id` (demo lesson үзэх), `/learning/*`, `/me`, admin.

## Устгах заавар
Demo-г бүрмөсөн авахдаа:
1. `apps/web/lib/demo/` хавтсыг бүхэлд нь устга (`data.ts`, `cover.ts`, `index.ts`).
2. `apps/web/lib/catalog.ts`: `getPublic` доторх `demoFallback` дуудлагууд (3 газар), `demoFallback`, `isEmptyPayload` функцүүдийг устга; `getPublic` анхны хэлбэрт (`fetch` → 404/400 бол `null` → `!ok` бол throw → json) буцна. `fetchCatalog`-ийг `getPublic`-тай үлдээж болно.
3. `apps/web/lib/client-api.ts`: `api()` дахь `isGet`/mutation шалгалт (`demoMutationError`), `catch` дахь болон `!res.ok || isEmptyPayload` дахь `demoFallback` салбарууд, мөн `demoFallback`, `demoMutationError`, `isEmptyPayload` функцүүдийг устга.
4. `apps/web/app/ui/demo-badge.tsx`-ийг устгаж, `apps/web/app/layout.tsx`-ээс `import { DemoBadge }` ба `<DemoBadge />`-ийг ав.
5. `apps/web/next.config.ts`-ээс `env: { NEXT_PUBLIC_DEMO_DATA ... }` мөрийг ав.
6. `apps/web/.env.example`-аас `NEXT_PUBLIC_DEMO_DATA`-г ав; local `.env`/Vercel-д байвал устга.
7. Шалгах: `grep -rn "demo-|NEXT_PUBLIC_DEMO_DATA|lib/demo" apps/web` хоосон; `pnpm --filter @lms/web typecheck` ба `build` ногоон.
