# 19: Community

**What to build:** Багш бүр өөрийн community-тэй: нийтлэл, сэтгэгдэл, like, pin. Тухайн багшийн ямар нэг lesson эзэмшсэн хэрэглэгч гишүүн болно. Багш нийтлэл устгах, гишүүн хасах эрхтэй. Community-д багшийн удахгүй болох live хичээлийн хуанли харагдана.

**Blocked by:** 14

**Status:** done — үлдсэнийг доорх "Үлдсэн"-ээс

> Шийдвэр: Community = багш (`teacher_id`); тусдаа community/гишүүнчлэлийн хүснэгт алга. Гишүүн = тухайн багшийн аль нэг lesson-ыг эзэмшдэг (lesson `Entitlement` эсвэл курсийн `CourseEntitlement`) — `purchases/entitlements.ts`-ийн `ownsAnyLessonOfTeacher`, `teachersOwnedBy`, `teacherCustomers`-ээр тухай бүр шалгана. Худалдан авмагц автоматаар гишүүн, мөр бичихгүй. Хүснэгтүүд: `community_posts`, `community_comments`, `community_likes`, `community_removals` (migration `20261117880000_community`).
>
> Шийдвэр: Эрх (`CommunityService.role`): багш өөрийнхөө community-д `TEACHER` (pin, бүгдийг устгах, гишүүн хасах), админ `ADMIN` (платформын модератор: үзэх, устгах; pin хийхгүй), эзэмшигч `MEMBER`. Гишүүн биш 403 `COMMUNITY_MEMBERS_ONLY`, хасагдсан 403 `COMMUNITY_REMOVED` — нийтлэл/сэтгэгдлийн id-аар хандахад ч ижил. Багш биш хэрэглэгчийн id 404 `COMMUNITY_NOT_FOUND`.
>
> Шийдвэр: Хасалт зөвхөн community-д — хичээлийн эрх хэвээр; дахин худалдан авалт хасалтыг арилгахгүй, багш "сэргээх" хүртэл. Хасагдсан гишүүний нийтлэл, сэтгэгдэл үлдэнэ (багш тус бүрийг устгана). Хасах/сэргээх, бусдын нийтлэл/сэтгэгдэл устгах (модерац) нь audit log-д (`community.member.remove|restore`, `community.post.delete`, `community.comment.delete`); зохиогч өөрийнхөө устгахад audit-гүй.
>
> Шийдвэр: Нийтлэл = Markdown текст (≤ 5000; web-ийн `Markdown` component) ба/эсвэл нэг зураг (≤ 5MB, JPG/PNG/WEBP/GIF). Зураг `private` bucket-д (`community/<teacherId>/<authorId>/…`), signed URL (1 цаг) — зөвхөн гишүүдэд. Upload нь даалгаврын адил: ticket → browser PUT → `createPost`-д `info()`-оор хэмжээ/төрөл шалгаж, буруу бол storage-оос устгана. Нийтлэлийн текстийг зохиогч засч болно (зургийг солихгүй; ticket 26).
>
> Шийдвэр: Pin зөвхөн багш, зэрэг ≤ 3 (409 `PIN_LIMIT`). Feed: pin-тэй нь тусдаа `pinned` (зөвхөн эхний хуудсанд, сүүлд pin хийсэн нь эхэнд), бусад нь шинэ нь эхэнд (`before` cursor, createdAt+id). Like idempotent (`PUT`/`DELETE`).
>
> Шийдвэр: Шинэ сэтгэгдлийн мэдэгдэл: нийтлэлийн зохиогчид `COMMUNITY_POST_COMMENT`, өмнө сэтгэгдэл бичсэн оролцогчдод (≤ 50) `COMMUNITY_THREAD_COMMENT`; сэтгэгдэл бичигч өөрт нь, хасагдсан хэрэглэгчид очихгүй. Мэдэгдлийн алдаа сэтгэгдлийг унагахгүй. Линк `/communities/<teacherId>?post=<id>` (тухайн нийтлэлийн сэтгэгдлийг нээнэ).
>
> Шийдвэр: Live хуанли (`GET /communities/:teacherId` → `upcomingLive`): багшийн PUBLISHED курсуудын APPROVED, архивлаагүй, дуусаагүй LIVE хичээлүүд, эхлэх цагаар (≤ 20). Нэгдэх линк гарахгүй (ticket 14: зөвхөн хичээлийн хуудсанд) — `canJoin` (эзэмшдэг/багш/админ) бол хичээлийн хуудас руу, үгүй бол курсийн хуудас руу.

- [x] Гишүүнчлэл entitlement-ээс автоматаар (lesson эсвэл бүтэн курс; өөр багшийнх тооцогдохгүй)
- [x] Нийтлэл (текст + зураг), сэтгэгдэл, like, pin
- [x] Багшийн moderation (устгах, гишүүн хасах / сэргээх; audit log)
- [x] Live хуанли
- [x] Шинэ сэтгэгдлийн мэдэгдэл (in-app + имэйл)
- [x] Integration тест (`community.spec.ts`): гишүүнчлэл (зочин 401, гишүүн биш 403 бүх endpoint-д, lesson/курс эзэмшигч, өөр багшийн эзэмшигч, багш, админ, багш биш id 404, миний community-ууд); нийтлэл (хоосон 400, зураг: төрөл/хэмжээ/зам/upload хийгээгүй, хэт томыг устгах, хуудаслалт); like idempotent; сэтгэгдэл + хуудаслалт + мэдэгдэл (зохиогч/оролцогч, өөрт нь биш); pin (зөвхөн багш, ≤ 3, тусдаа жагсаалт); moderation (гишүүн бусдынхыг устгахгүй, багш/админ устгах + audit, cascade, зураг устгах); гишүүн хасах (бүх endpoint 403 `COMMUNITY_REMOVED`, дахин худалдан авалт сэргээхгүй, lesson эрх хэвээр, мэдэгдэл очихгүй, сэргээх); live хуанли (эрэмбэ, дууссан/шалгагдаагүй/ноорог/өөр багшийнх үгүй, `canJoin`, линк алга)

API: `GET /communities`, `GET /communities/:teacherId`, `GET|POST /communities/:teacherId/posts`, `POST /communities/:teacherId/uploads`, `DELETE /community/posts/:id`, `PUT|DELETE /community/posts/:id/pin`, `PUT|DELETE /community/posts/:id/like`, `GET|POST /community/posts/:id/comments`, `DELETE /community/comments/:id`, `GET /teacher/community/members`, `POST /teacher/community/members/:userId/remove|restore`. Web: `/communities`, `/communities/[teacherId]`, `/teacher/community`; header-т "Community", багшийн profile болон "Миний курсууд"-ад линк.

## Ticket 26 (community extras) — хийгдсэн

Migration `20261117930000_community_extras`.

- **Засах:** `PATCH /community/posts/:id` (текст), `PATCH /community/comments/:id`. Зөвхөн зохиогч (багш/админ ч бусдынхыг засахгүй, 403), хасагдсан/гишүүн биш бол `role()`-ийн ердийн 403. Текст өөрчлөгдсөн үед `editedAt` тавигдаж UI "засварласан <огноо>" гэж харуулна; өөрчлөлтгүй бол тэмдэглэхгүй. Засвар мэдэгдэл үүсгэхгүй. Нуугдсан нийтлэл/сэтгэгдлийг засахгүй. Багш/админы устгах модерац хэвээр.
- **Гишүүд SQL-ээр:** `memberCount` нь `customers` CTE (lesson + course entitlement, `teacher_id`-аар) + `community_removals`-ийн `NOT EXISTS`-ээр SQL-д тоологдоно. `GET /teacher/community/members?page=&limit=` → `{ items, total, page, pageSize }` (SQL `ORDER BY since DESC, user_id DESC LIMIT/OFFSET`, `total` хасагдсаныг оруулна). Гишүүнчлэл entitlement-ээс гарах загвар өөрчлөгдөөгүй; `teacherCustomers` (JS) community-д ашиглагдахаа больсон.
- **Хасалт/сэргээлтийн мэдэгдэл:** `COMMUNITY_MEMBER_REMOVED` (шалтгаантай бол тайлбарт орно), `COMMUNITY_MEMBER_RESTORED` — in-app + имэйл. Аль хэдийн хасагдсаныг давтан хасахад дахин мэдэгдэхгүй. Мэдэгдлийн алдаа үйлдлийг унагахгүй.
- **Мэдэгдлийн имэйл тохиргоо (дахин ашиглагдана):** хүснэгт `notification_preferences(user_id, category, email_enabled)`, мөр байхгүй = идэвхтэй. Төрөл → ангилал `apps/api/src/notifications/categories.ts` (`COMMUNITY_POST_COMMENT`, `COMMUNITY_THREAD_COMMENT` → `COMMUNITY_COMMENT`), ангиллын жагсаалт `NOTIFICATION_CATEGORIES` (shared). `NotificationsService.notify` унтраасан ангиллын имэйлийг дараалалд хийхгүй (`emailStatus=NONE`), in-app үргэлж үүснэ. `GET /notifications/preferences`, `PUT /notifications/preferences/:category { emailEnabled }`. UI: `/me`-ийн "Мэдэгдлийн тохиргоо". Шинэ ангилал нэмэх: `NOTIFICATION_CATEGORIES` + `categories.ts` + web `notifPrefs.<CATEGORY>` текст. Ангилалд ороогүй төрөл (хасалт, төлбөр…) имэйлээр үргэлж явна.
- **Админ moderation:** `/admin/community` (nav-д "Community модерац"). API `GET /admin/community/items?kind=post|comment&status=ALL|VISIBLE|HIDDEN&before=&limit=`, `POST /admin/community/{posts|comments}/:id/hide {reason}` / `unhide` / `delete {reason}`. Шалтгаан заавал; audit: `community.post|comment.hide|unhide`, `community.post|comment.delete` (`after: { reason, by: 'admin-moderation' }`). Нуусан агуулга энгийн гишүүнд `body: ''`, `imageUrl: null`, `hidden: true`, `hiddenReason`-тэй ирнэ (багш/админ агуулгыг харна). Давхар нуух 409 `ALREADY_HIDDEN`, нуугаагүйг сэргээх 409 `NOT_HIDDEN`.
- Тест: `community.spec.ts` (засах эрх, хуудаслалт/count, хасалт/сэргээлтийн мэдэгдэл, имэйл тохиргоо, админ 403/200).

## Үлдсэн

- Realtime (websocket) байхгүй — хуудас ачаалах / "цааш үзэх"-ээр шинэчлэгдэнэ.
- Thread доторх reply, mention, олон зураг, нийтлэлийн зураг солих — хийгээгүй.
- Гишүүдийн жагсаалт offset хуудаслалттай (хэдэн мянган гишүүнд хангалттай); `memberCount` тухай бүр SQL-ээр тоологддог — маш олон гишүүнтэй болбол кэшлэх/materialize хийх.
- Нуусан нийтлэл/сэтгэгдлийн зохиогчид мэдэгдэл очихгүй (UI-д л "нуусан" гэж харна).
- Нуусан нийтлэлд шинэ сэтгэгдэл бичихийг хориглоогүй.
- Мэдэгдлийн тохиргоо зөвхөн имэйл (in-app унтраах, push, давтамжийн digest алга).
