# 14: Live хичээл

**What to build:** Багш live lesson-д огноо, цаг, Zoom/Meet линк оруулна. Линк зөвхөн эрхтэй хэрэглэгчид харагдана. Эхлэхээс 24 цаг болон 15 минутын өмнө сануулга очно.

**Blocked by:** 03, 09

**Status:** done — бичлэг оруулах (Mux, ticket 10), багшийн live хуанли (story 63) үлдсэн (доорх "Үлдсэн")

> Шийдвэр: Live-ийн хуваарь `lessons.content`-д (`{ startsAt, durationMinutes, meetingUrl }`, `LESSON_TYPES.LIVE` — `apps/api/src/catalog/lesson-types.ts`) — бусад төрлийн адил problems/preview/контентын урсгалаар явна. Тусдаа хүснэгт зөвхөн илгээсэн сануулгад: `live_reminders` (lesson, kind `H24`/`M15`, starts_at) PK (migration `20261117820000_live_lessons`).
>
> Шийдвэр: Цаг — API офсетгүй `YYYY-MM-DDTHH:mm`-ийг Улаанбаатарын цаг (UTC+8, зуны цаггүй) гэж хүлээн авна (офсеттэй ISO ч болно), ISO (UTC)-ээр хадгалж буцаана. Helper-ууд `@lms/shared` `live.ts` (`ubLocalToIso`, `isoToUbLocal`, `formatUbDateTime`, `liveState`). Үргэлжлэх хугацаа 15–600 минут, линк заавал `https://`. Шинэ/өөрчилсөн эхлэх цаг ирээдүйд байх ёстой (`LIVE_START_IN_PAST`); цаг өөрчлөлгүй линк солиход шалгахгүй.
>
> Шийдвэр: Нийтлэгдсэн (APPROVED) хичээлийн агуулга түгжигддэг ч LIVE-ийн хуваарь, линк үл хамаарна — цаг хойшлох, линк солих нь ажиллагааны өөрчлөлт, дахин шалгалтгүй. Нийтлэгдсэн live-ийн цаг өөрчлөгдвөл эзэмшигчдэд `LIVE_RESCHEDULED` мэдэгдэл (анх цаг тогтооход биш, багшид биш).
>
> Шийдвэр: Линк зөвхөн `access` ∈ OWNED / TEACHER / ADMIN үед (`toContent(..., { revealMeetingUrl })`). Free preview live-д хуваарь харагдана, линк `null` — "зөвхөн худалдан авсан хүнд" (SPEC story 54: "only if I own that lesson"). Эрхгүй бол 403 (контент огт алга). Курсийн хуудсанд (`PublicLessonItem.live`) зөвхөн хуваарь. Имэйл/мэдэгдэлд линк оруулахгүй — хичээлийн хуудас руу заана.
>
> Шийдвэр: Сануулга — `live.reminder` delayed ажил (`LiveLessonsService`), эхлэх цаг тогтоогдох/өөрчлөгдөх бүрт 24ц ба 15м-ийн өмнө; `jobId` = lesson+kind+startsAt (давтан хадгалахад давхардахгүй). Өнгөрсөн босгыг товлохгүй (2 цагийн дараах live-д зөвхөн 15м). Дарааллаас ажил устгадаггүй: хуучин ажил ажиллахдаа payload-ийн `startsAt` ≠ одоогийнх тул юу ч хийхгүй — BullMQ, in-memory аль алинд ижил. Ажиллах мөчид lesson LIVE + APPROVED + архивлаагүй + курс PUBLISHED + live дуусаагүй байх ёстой (шалгалтын өмнө товлосон ч батлагдсаны дараа зөв очно).
>
> Шийдвэр: Хүлээн авагч — эзэмшигчид (`lessonOwnerIds`: lesson `Entitlement` ∪ курсийн `CourseEntitlement`) + курсийн багш. `live_reminders` мөрийг claim хийсний дараа л илгээнэ → дээд тал нь нэг удаа (16-тай ижил: claim-ийн дараа унавал алдагдана, давхардахгүй). Нэг хэрэглэгчийн алдаа бусдыг зогсоохгүй. In-app + имэйл (`LIVE_REMINDER_H24`, `LIVE_REMINDER_M15`).
>
> Шийдвэр: Дууссан live → бичлэг: `POST /teacher/lessons/:id/convert-to-video` (дууссан = startsAt + duration ≤ одоо, үгүй бол 409 `LIVE_NOT_ENDED`; LIVE биш бол 409 `NOT_LIVE`). Зөвхөн төрөл солигдоно (`type = VIDEO`, `content = { fromLive: { startsAt, durationMinutes } }`); lesson id, үнэ, шалгалтын төлөв, эрх хэвээр. Хүлээгдэж буй сануулга очихгүй. Бичлэг оруулах ticket 10-д.

- [x] Live lesson: эхлэх цаг (Улаанбаатарын цаг), үргэлжлэх хугацаа, линк (багшийн засварлагч: `datetime-local` + минут + линк; нийтлэгдсэн ч засагдана)
- [x] Линк зөвхөн entitlement-тэй үед API-аас гарна (эзэмшигч, багш, админ; preview-д ч үгүй)
- [x] Сануулга BullMQ-ээр (цаг өөрчлөгдөхөд дахин товлогдоно; хуучин ажил no-op; эзэмшигчдэд "цаг өөрчлөгдлөө")
- [x] Дууссан live-ийг бичлэг (видео lesson) болгон солих боломж (API + багшийн UI товч)
- [x] Integration тест (`live.spec.ts`, 8 тест): UB цаг хөрвүүлэлт + validation; линкийн эрх (зочин/эрхгүй/lesson эзэмшигч/курс эзэмшигч/багш/админ, курсийн хуудсанд линк алга); free preview-д линкгүй; 24ц/15м товлолт (delay), эзэмшигч + багшид нэг л удаа, давтан ажилд давхардахгүй; дахин товлолт (хуучин ажил no-op, шинэ цагаар л илгээнэ, `LIVE_RESCHEDULED`); өнгөрсөн босго алгасах; шалгагдаагүй/архивласан live-д үгүй; бичлэг болгох (409-ууд, эрх хэвээр, сануулга очихгүй)

API: `PATCH /teacher/lessons/:id { content: { startsAt, durationMinutes, meetingUrl } }`, `POST /teacher/lessons/:id/convert-to-video`. `GET /catalog/lessons/:id` → `content: { type: 'LIVE', startsAt, durationMinutes, endsAt, meetingUrl | null }`; `GET /catalog/courses/:id` lesson бүрт `live: { startsAt, durationMinutes } | null`.

Web: багшийн курс засварлагчид live талбарууд + "Бичлэгийн хичээл болгох"; хичээлийн хуудсанд цаг (Улаанбаатар), төлөв (Удахгүй / Явагдаж байна / Дууссан), "Шууд хичээлд нэгдэх" товч; курсийн агуулгад live-ийн цаг. Бүх текст `messages/mn.json` `live.*`, мэдэгдэл `apps/api/src/i18n/mn.json`.

## Үлдсэн

- [ ] Ticket 10: `VIDEO` төрөл нэмэхэд бичлэг болгосон APPROVED lesson-д бичлэг оруулахыг зөвшөөрөх (одоо APPROVED агуулга түгжигддэг; `content.fromLive`-аар ялгана).
- [ ] Story 63: багшийн удахгүй болох live-уудын хуанли (`lessons.content->>'startsAt'`-аар эсвэл тусдаа багана).
- [ ] Production (Railway, `REDIS_URL`)-д `live.reminder` delayed ажил цагтаа ажилласныг log-оос шалгах.
- [ ] `public` (dev) schema-д migration-ийг `pnpm db:deploy`-оор хэрэгжүүлэх.
