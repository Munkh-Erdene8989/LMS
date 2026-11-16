# 06: Курс үүсгэх ба админы шалгалт

**What to build:** Багш курс (гарчиг, тайлбар, зураг, ангилал, түвшин) үүсгэж, section болон lesson-уудыг (энэ ticket-д текст, PDF; бусад төрлүүд дараагийн ticket-д) нэмж, дарааллыг өөрчилнө. Lesson бүрт кредит үнэ, курст бүтэн үнэ тогтоож, free preview тэмдэглэнэ. Шалгуулахаар илгээхэд админ бүх контентыг үзэж зөвшөөрөх эсвэл тайлбартай буцаана. Нийтлэгдсэн курст шинэ lesson нэмэхэд тэр lesson дахин шалгалтад орно.

**Blocked by:** 05

**Status:** done — Supabase Storage түлхүүр тохируулах үлдсэн (доорх "Үлдсэн")

> Шийдвэр: Нийтлэгдсэн (APPROVED) lesson-ы **агуулгыг** засахгүй (`LESSON_CONTENT_LOCKED`) — худалдан авсан хүмүүст шалгагдаагүй өөрчлөлт очихоос сэргийлнэ. Гарчиг, үнэ, preview-г засна; агуулга өөрчлөх бол шинэ lesson нэмнэ. Устгавал архивлана (`archivedAt`), DB-д үлдэнэ.
>
> Шийдвэр: "Rich text" = Markdown (аюулгүй, өөрийн renderer — HTML тайлбарлахгүй, линк зөвхөн http(s)). Гадны editor/sanitizer сан шаардлагагүй.
>
> Шийдвэр: Файл API-аар дамжихгүй — signed URL-аар шууд storage руу, дараа нь API `info()`-оор төрөл/хэмжээ/замыг шалгаж хүлээн авна. Supabase түлхүүргүй dev-д local диск (`apps/api/.storage`, HMAC гарын үсэгтэй URL).

- [x] Курсийн төлөв: draft → in_review → published / rejected (шалгагдаж байхад засварлах түгжигдэнэ)
- [x] Section, lesson CRUD + дараалал өөрчлөх (`PUT /teacher/courses/:id/curriculum` — бүлэг хооронд зөөх орно)
- [x] Lesson төрлийн өргөтгөх боломжтой загвар (`apps/api/src/catalog/lesson-types.ts`; VIDEO/QUIZ/ASSIGNMENT/LIVE enum-д бий, үүсгэхэд `LESSON_TYPE_UNAVAILABLE`)
- [x] Текст (Markdown) болон PDF (Storage `private` bucket, 50MB, signed URL) lesson; курсийн зураг (`public` bucket, 5MB, JPG/PNG/WebP)
- [x] Lesson кредит үнэ, курсийн бүтэн үнэ (≤ хичээлүүдийн нийлбэр), free preview
- [x] Ангилал (2 түвшин, кирилл → латин slug) админаас удирдагдана; нийтэд `GET /categories`
- [x] Админы шалгах дараалал: бүх lesson-ыг үзэх (PDF signed URL), зөвшөөрөх/буцаах (курс эсвэл нэг lesson)
- [x] Нийтлэгдсэн курсийн шинэ lesson тусдаа шалгалтад орж (`kind: LESSONS`), APPROVED lesson-д хүрэхгүй
- [x] Мэдэгдэл (`COURSE_APPROVED|REJECTED`, `LESSONS_APPROVED|REJECTED`), audit log (course/lesson/category)
- [x] Integration тест: зөвхөн өөрийн курсийг засах, төлөвийн шилжилт (`catalog.spec.ts`, 14 тест)

Web: `/teacher/courses`, `/teacher/courses/[id]`, `/admin/course-reviews`, `/admin/courses/[id]`, `/admin/categories`.

## Үлдсэн

- [ ] Supabase → Project Settings → API: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`-г `.env` болон Railway-д. API асахдаа `lms-public`, `lms-private` bucket-уудыг өөрөө үүсгэнэ. Production-д заавал.
- [ ] Learner-т lesson агуулга харуулах (entitlement шалгалттай) — ticket 07/09.
