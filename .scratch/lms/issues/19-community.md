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
> Шийдвэр: Нийтлэл = Markdown текст (≤ 5000; web-ийн `Markdown` component) ба/эсвэл нэг зураг (≤ 5MB, JPG/PNG/WEBP/GIF). Зураг `private` bucket-д (`community/<teacherId>/<authorId>/…`), signed URL (1 цаг) — зөвхөн гишүүдэд. Upload нь даалгаврын адил: ticket → browser PUT → `createPost`-д `info()`-оор хэмжээ/төрөл шалгаж, буруу бол storage-оос устгана. Нийтлэлийг засах боломжгүй (устгаад дахин бичнэ).
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

## Үлдсэн

- Realtime (websocket) байхгүй — хуудас ачаалах / "цааш үзэх"-ээр шинэчлэгдэнэ.
- Нийтлэл/сэтгэгдэл засах, thread доторх reply, mention, олон зураг — хийгээгүй.
- Гишүүдийн жагсаалт, `memberCount` бүх эзэмшигчийг санах ойд тооцдог (хуудаслалтгүй) — олон мянган гишүүнтэй болоход хуудаслах/кэшлэх.
- Хасагдсан гишүүнд мэдэгдэл очихгүй (community руу ороход л тайлбар харна).
- Сэтгэгдлийн имэйл мэдэгдлийг унтраах тохиргоо (notification preferences) алга.
- Админы community модерацийн тусдаа UI алга (админ шууд `/communities/<teacherId>` руу орж устгана).
