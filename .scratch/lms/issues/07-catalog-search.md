# 07: Каталог ба хайлт

**What to build:** Зочин болон хэрэглэгч нийтлэгдсэн курсуудыг ангиллаар үзэж, үнэ, үнэлгээ, түвшин, free preview-ээр шүүж, кирилл үсэгт алдаа тэсвэртэй хайлт хийнэ. Курсийн хуудас нь агуулга, lesson бүрийн үнэ, курсийн бүтэн үнэ, багшийн мэдээллийг харуулна. Багшийн нийтийн profile хуудас бий.

**Blocked by:** 06

**Status:** done — үнэлгээ (ticket 18), "аль хэдийн төлсөн дүнг хасах" ба эрхтэй хэрэглэгчийн контент (ticket 09)-д холбох цэгүүд бэлэн (доорх "Үлдсэн")

> Шийдвэр: Нийтэд зөвхөн `PUBLISHED` курс, зөвхөн `APPROVED` + архивлаагүй lesson. Бусад төлөвийн курс, lesson-ы дэлгэрэнгүй/контент 404 (оршин буйг ч илчлэхгүй). Lesson-ы контент `LessonAccessPolicy.canViewContent()`-оор л гарна (одоогоор free preview) — ticket 09 entitlement-ийг энэ нэг газарт нэмнэ.
>
> Шийдвэр: Хайлт `pg_trgm`-ийн `word_similarity` (гарчиг, тайлбар, багшийн нэр) ≥ 0.45 + `ILIKE` substring (богино үгэнд). Анхдагч 0.6 нь "прогрмчлал" → "Програмчлалын" (≈0.57)-ыг алгасдаг тул босгыг transaction доторх `set_config(..., true)`-оор тогтооно. Эрэмбэ: гарчигт таарвал илүү жинтэй, тайлбарт хамгийн бага. Латин ↔ кирилл хөрвүүлэлт хийхгүй.
>
> Шийдвэр: `pg_trgm` нь `extensions` schema-д (Supabase-ийн дүрэм; CI-ийн энгийн Postgres-д migration schema-г үүсгэнэ, өөр schema-д суусан бол зөөнө). Апп/тест `?schema=`-аар search_path-ийг нэг schema болгодог тул SQL-д үргэлж `extensions.word_similarity`, `OPERATOR(extensions.<%)`, `extensions.gin_trgm_ops`. Prisma schema-д index-ийг `raw("gin_trgm_ops")`-оор зарласан — introspection-тэй таарч, `migrate diff` дахин үүсгэхгүй.
>
> Шийдвэр: Багшийн нийтийн нэр, bio = зөвшөөрөгдсөн (`APPROVED`) багшийн өргөдлийн `displayName`, `bio`, `expertise`; өргөдөлгүй (CLI-ээр эрх олгосон) багшид хэрэглэгчийн `name`, тэр ч үгүй бол "Багш". Avatar = `users.avatar_url`. Profile зөвхөн `TEACHER` эрхтэй хэрэглэгчид (бусад 404).
>
> Шийдвэр: Курсийн URL `/courses/[id]` (UUID). Slug багана нэмээгүй: гарчиг өөрчлөгдөхөд хуучин линк эвдрэхгүй, SEO-д `<title>`, description, OG зураг, canonical хангалттай. Ангилал slug-аар (`/courses?category=programchlal`).
>
> Шийдвэр: Үнэлгээ — `apps/api/src/catalog/ratings.ts` цорын ганц эх үүсвэр: `RATING_LATERAL` (SQL, шүүлтүүр/эрэмбэ) + `loadRatings()` (карт). Одоогоор `{ average: null, count: 0 }`; `minRating` юу ч олохгүй, `sort=rating` нь null-ийг сүүлд тавина. Ticket 18 энэ файлыг л солино.
>
> Шийдвэр: Буруу query параметрийг (жишээ нь `level=EXPERT`) 400 биш, үл тооно — хэрэглэгч URL-ийг гараар засаж болно.

- [x] Ангиллаар үзэх (2 түвшин) — үндсэн ангилал дэд ангиллуудынхаа курсийг агуулна (`?category=<slug>`)
- [x] Шүүлтүүр: үнэ (курсийн бүтэн үнэ, кредит), үнэлгээ (ticket 18-д утгатай болно), түвшин, free preview; эрэмбэ: хамааралтай / шинэ / үнэ ↑↓ / үнэлгээ; хуудаслалт
- [x] `pg_trgm` хайлт (гарчиг, тайлбар, багшийн нэр), буруу бичсэн үгийг олно ("прогрмчлал" → "Програмчлалын үндэс"); шүүлтүүртэй хослоно
- [x] Курсийн хуудас: curriculum (зөвхөн нийтлэгдсэн хичээл, төрөл, үнэ, preview), бүтэн үнэ, хичээлүүдийн нийт үнэ, багш, ангилал; free preview lesson-ыг нэвтрээгүй ч үзнэ (текст, PDF 5 минутын signed URL)
- [x] Багшийн profile хуудас (зөвхөн нийтлэгдсэн курсууд)
- [x] SEO: server render (JS-гүй ажиллана — GET form), `generateMetadata` (title, description, canonical, OpenGraph/Twitter зураг = курсийн зураг)
- [x] Integration тест (`catalog-public.spec.ts`, 12 тест): draft/in-review/rejected курс каталог, хайлт, дэлгэрэнгүй, багшийн profile-д харагдахгүй; шалгагдаагүй/архивласан lesson нуугдана; төлбөртэй контент 403; preview нэвтрэлтгүй; шүүлтүүр; алдаатай хайлт; эх ангилал; зохиох → шалгах → каталог end-to-end

API (нэвтрэлтгүй): `GET /catalog/courses?q&category&level&minPrice&maxPrice&minRating&freePreview&sort&page&pageSize`, `GET /catalog/courses/:id`, `GET /catalog/lessons/:id` (эрхгүй бол 403 `LESSON_LOCKED`), `GET /catalog/teachers/:id`, `GET /categories` (06).

Web: `/courses`, `/courses/[id]`, `/courses/[id]/lessons/[lessonId]`, `/teachers/[id]`; дээд цэс, нүүр хуудсанд линк.

## Үлдсэн

- [x] Ticket 09 (хийгдсэн): `LessonAccessPolicy.canViewContent()`-д entitlement; `GET /catalog/lessons/:id`, `/catalog/courses/:id`-д optional auth (viewerId); `PublicCatalogService.pricing()`-д тухайн курст зарцуулсан кредитийг хасах (`payableCredits`); курсийн хуудасны "Худалдаж авах" товч.
- [x] Ticket 18 (хийгдсэн): `ratings.ts`-ийг review aggregate-аар солих; курсийн хуудсанд review жагсаалт.
- [x] Ticket 29 (хийгдсэн): курст денормчилсон `search_text` багана (`title 
 description 
 багшийн нийтийн нэр`) + нэг GIN trigram index `courses_search_text_trgm_idx` (migration 20261118110000_course_search_text; хуучин гурван trigram index-ийг орлосон). Хайлтын шүүлт зөвхөн `c.search_text`-ийг ашиглана; эрэмбийн score өмнөхөөр талбар тус бүрээр (үр дүн, эрэмбэ өөрчлөгдөөгүй). Синк нь DB trigger-ээр: `courses` (title/description/teacher_id), `users.name`, `teacher_applications` (display_name/status/user_id) — код зам мартаж чадахгүй. Migration-д backfill. Багана нь кодоос бичигдэхгүй. Ангилал/tag хайлтад ороогүй (өмнө нь ч байгаагүй, үр дүн хэвээр байлгах үүднээс). dev `public` schema-д `pnpm db:deploy`-оор хэрэгжүүлэх шаардлагатай.
- [x] `public` (dev) schema-д migration-ийг `pnpm db:deploy`-оор хэрэгжүүлэх (pg_trgm extension DB-д аль хэдийн `extensions` schema-д суусан).
