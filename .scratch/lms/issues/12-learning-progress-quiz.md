# 12: Суралцах: "Миний сургалт", явц, quiz

**What to build:** Хэрэглэгч "Миний сургалт" хэсэгт эзэмшсэн курс, lesson, явцаа харж, үргэлжлүүлнэ. Lesson дуусгасан нь автоматаар бүртгэгдэнэ. Багш quiz lesson (нэг/олон сонголттой) үүсгэж, хэрэглэгч бөглөж оноогоо харна.

**Blocked by:** 09

**Status:** done — видео player (ticket 10) явцын endpoint-д холбогдох үлдсэн (доорх "Үлдсэн")

> Шийдвэр: Шинэ `learning` модуль. Lesson-д хандах эрх ЗӨВХӨН `LessonAccessPolicy.open(lessonId, viewer)`-оор (ticket 09-ийн `/catalog/lessons/:id`-ийн дүрмийг нэг газар гаргасан: APPROVED + PUBLISHED, архивласан нь зөвхөн эзэмшигч/багш/админд, эрхгүй → 403 `LESSON_LOCKED`). Контент үзэх эрхтэй хүн (эзэмшигч, preview, багш, админ) л явц бичиж, quiz бөглөнө. "Миний сургалт"-ын эзэмшил `purchases/entitlements.ts`-ийн шинэ `ownedCourses()`-оор.
>
> Шийдвэр: Явц — `lesson_progress` (user × lesson, unique). Утгууд зөвхөн өсөнө: `watched_percent`, `best_score_percent` max, `completed_at` нэг удаа — upsert + нөхцөлтэй `updateMany` (атомар, зэрэг хүсэлт бууруулахгүй). Дуусгалт: TEXT/PDF — "Дууслаа" товч (`POST /learning/lessons/:id/complete`); VIDEO — `POST /learning/lessons/:id/progress { watchedPercent }`, ≥ 90% (`VIDEO_COMPLETE_PERCENT`) → дууссан (ticket 10 энд холбогдоно); QUIZ — тэнцэх оноо авахад автоматаар (гараар 409 `COMPLETION_NOT_MANUAL`). Lesson нээхэд `progress` (body хоосон) → "сүүлд үзсэн".
>
> Шийдвэр: Курсийн явцын хувь = floor(дууссан / эзэмшиж буй архивлаагүй lesson × 100). Хэсэгчлэн эзэмшсэн бол зөвхөн эзэмшсэн lesson-оор. Архивласан эзэмшсэн lesson `/learning/courses/:id`-д харагдана (ticket 09-ийн үлдэгдэл), явц бичигдэнэ, гэхдээ хувьд тооцогдохгүй. "Үргэлжлүүлэх" = сүүлд нээсэн дуусаагүй lesson, үгүй бол дараалал дахь эхний дуусаагүй. Жагсаалт сүүлд үзсэн/авсан нь эхэнд.
>
> Шийдвэр: Quiz-ийн контент `lessons.content`-д (`{ passPercent, questions: [{ id, text, multiple, options: [{ id, text }], correctOptionIds }] }`); багшийн оролт сонголт бүрт `correct` boolean, id-г API үүсгэж/хадгална. Нийтлэгдсэн (APPROVED) quiz-ийн агуулга түгжигдэх тул оролдлогууд хуучин асуулттай зөрөхгүй. Шалгуулахад: асуулт ≥ 1, сонголт ≥ 2, хоосон текстгүй, зөв хариулт ≥ 1, нэг сонголттойд яг 1.
>
> Шийдвэр: Зөв хариулт client руу хэзээ ч очихгүй: `toContent(..., revealAnswers)` — `answerKey` зөвхөн багшийн засварлах / админы шалгах view-д (`toCourseDetail`); `/catalog/lessons/:id` (багш, админ ч энд) болон `/learning/*` хариунд байхгүй (тестээр JSON-оос шалгасан). Оролдлогын хариу зөвхөн оноо (`correctCount`, `scorePercent`, `passed`) — асуулт тус бүрийн зөв/бурууг ч буцаахгүй.
>
> Шийдвэр: Оноо — асуулт бүр 1 оноо; олон сонголттойд зөвүүдийг яг таг (илүү, дутуугүй) сонгосон үед л зөв, хэсэгчилсэн оноогүй; хариулаагүй = буруу. `scorePercent = floor(зөв × 100 / нийт)` (дээш бөөрөнхийлөхгүй — сертификатын ≥70% босго). Байхгүй асуулт/сонголт, давхардал, нэг сонголттойд олон → 400 `INVALID_ANSWERS`. Оролдлого бүр `quiz_attempts`-д (хариулт, оноо, тухайн үеийн тэнцэх оноо), хязгааргүй дахин оролдоно; хамгийн өндөр оноо `lesson_progress.best_score_percent`.

- [x] "Миний сургалт" жагсаалт + курсийн явцын хувь (`/learning`, `/learning/[courseId]`, дээд цэсний линк)
- [x] Lesson дуусгалт (видео ~90% — `progress` endpoint, текст/PDF нээх + "дууслаа" товч)
- [x] Quiz үүсгэх: асуулт, сонголт, зөв хариулт, тэнцэх оноо (багшийн засварлагч; `AVAILABLE_LESSON_TYPES`-д QUIZ)
- [x] Quiz бөглөх, оноо харах, дахин оролдох; хамгийн өндөр оноо хадгалагдана
- [x] Зөв хариулт client руу илгээгдэхгүй
- [x] Integration тест (`learning.spec.ts`, 11 тест): эрхгүй quiz бөглөх/харах боломжгүй (403, юу ч бичигдэхгүй; өөр lesson эзэмших хангалтгүй; зочин 401), зөв хариулт гарахгүй (learner, багшийн нийтийн view, оролдлогын хариу), free preview quiz, оноо тооцоо (нэг/олон сонголт, дутуу/илүү сонголт, хариулаагүй, floor), дахин оролдлого + хамгийн өндөр оноо, буруу хариулт 400, quiz зохиох + problems, явц (текст/видео 89→95→10/quiz) + курсийн хувь + үргэлжлүүлэх, хэсэгчилсэн эзэмшил + архив, хэрэглэгч тусдаа

Migration: `20261117810000_learning` (`lesson_progress`, `quiz_attempts` + CHECK-үүд).

API: `GET /learning/courses`, `GET /learning/courses/:id`, `GET /learning/lessons/:id` (`progress`, `quiz` — оролдлогууд, хамгийн өндөр оноо), `POST /learning/lessons/:id/progress { watchedPercent? }`, `POST /learning/lessons/:id/complete`, `POST /learning/lessons/:id/quiz-attempts { answers: [{ questionId, optionIds }] }` → `{ attempt, progress, quiz }`.

Web: `/learning` (явцын мөр, "Үргэлжлүүлэх"), `/learning/[courseId]` (хөтөлбөр, ✓, видеоны хувь, quiz оноо), хичээлийн хуудсанд "Дууслаа" товч / quiz бөглөх + оролдлогын түүх, багшийн quiz засварлагч, багш/админы урьдчилан харахад зөв хариулт тэмдэглэгдэнэ.

## Үлдсэн

- [x] Ticket 10: Mux player үзсэн хувийг `POST /learning/lessons/:id/progress { watchedPercent }` руу үе үе илгээх (VIDEO төрлийг `AVAILABLE_LESSON_TYPES`-д нэмэх).
- [ ] Ticket 15: сертификатын нөхцөлд `lesson_progress.completed_at` (бүх идэвхтэй lesson) ба `best_score_percent`-ийн дундаж (≥70%) — архивласан lesson-ыг тооцох эсэхийг тэнд шийдэх.
- [x] Quiz оролдлогын хурдны хязгаар (суралцагчид; багш/админд үгүй): хэрэглэгч × lesson-д 30 секундын cooldown + гулсах 24 цагт 10 оролдлого, хэтэрвэл 429 `QUIZ_RATE_LIMITED` (монгол мессеж, дараагийн цаг Улаанбаатараар). Шалгах + бичих нь `pg_advisory_xact_lock`-оор атомар (зэрэг хүсэлт давахгүй). `QuizState.nextAttemptAt` → UI товч идэвхгүй + хүлээх хугацаа. Тест `quiz-rate-limit.spec.ts` (4); `learning.spec.ts` өмнөх оролдлогыг хуучруулдаг.
- [x] `public` (dev) schema-д migration-ийг `pnpm db:deploy`-оор хэрэгжүүлэх.
