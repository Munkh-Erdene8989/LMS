# LMS

Монгол зах зээлд зориулсан онлайн сургалтын платформ. Шийдвэрүүд: [docs/SPEC.md](docs/SPEC.md). Ажлын жагсаалт: [.scratch/lms/issues/](.scratch/lms/issues/).

## Бүтэц

| Хавтас | Юу вэ | Deploy |
|---|---|---|
| `apps/web` | Next.js — learner, teacher, admin UI | Vercel |
| `apps/api` | NestJS API | Railway |
| `packages/db` | Prisma schema + migration | — |
| `packages/shared` | Хуваалцсан төрөл, брэнд тохиргоо | — |

## Эхлүүлэх

Шаардлага: Node.js 20+, pnpm 10.

```bash
pnpm install
cp .env.example .env      # Supabase lms-dev төслийн connection string-ийг бөглөнө
pnpm db:deploy            # migration-уудыг dev DB-д хэрэгжүүлнэ
pnpm dev                  # web: http://localhost:3000, api: http://localhost:4000
```

Нүүр хуудсанд "API: ok, Өгөгдлийн сан: ok" харагдвал бүх давхарга холбогдсон гэсэн үг.

## Командууд

| Команд | Үйлдэл |
|---|---|
| `pnpm dev` | web + api watch горимоор |
| `pnpm test` | API integration тест (`DATABASE_URL_TEST`-ийн schema-д) |
| `pnpm typecheck` / `pnpm lint` | Төрөл шалгах |
| `pnpm db:migrate` | Schema өөрчилсний дараа шинэ migration үүсгэх |
| `pnpm db:deploy` | Migration-уудыг хэрэгжүүлэх |

## Тест

- Тест хийх цорын ганц seam: **API-ийн HTTP түвшин**. Бодит Postgres, гадны сервисүүд (SMS, имэйл, QPay, Mux) fake.
- Тест `DATABASE_URL_TEST`-д заасан schema-д (`lms_test`) ажиллаж, тест бүрийн өмнө тэр schema-ийн хүснэгтүүдийг цэвэрлэнэ. `public` schema-г заавал хориглосон.
- Шинэ тест: `apps/api/test/*.spec.ts`, `createTestApp()`-аар апп үүсгэнэ. Нэвтэрсэн хэрэглэгч хэрэгтэй бол `loginByEmail()` / `loginByPhone()`.

## Нэвтрэлт

- Утас: verify.mn — хэрэглэгч бидний өгсөн кодыг өөрийн утаснаас 144773 руу SMS-ээр илгээнэ, бид төлөвийг шалгана.
- Имэйл: Resend-ээр 6 оронтой код.
- Browser API руу web-ийн `/api/*` proxy-оор хандана (cookie first-party). API-ийн `COOKIE_PATH_PREFIX` нь `/api` байх ёстой.
- `VERIFY_MN_API_KEY` / `RESEND_API_KEY` хоосон бол dev-д fake: имэйлийн код API-ийн консолд хэвлэгдэнэ.
- Endpoint-д нэвтрэлт шаардах: `@Auth()`, role шаардах: `@Auth('ADMIN')`, хэрэглэгч авах: `@CurrentUser()`.

## Админ

- Эхний админ: тухайн утас/имэйлээр нэг удаа нэвтэрсний дараа `pnpm --filter @lms/api admin:grant <утас|имэйл>`. Дараа нь `/admin`.
- Тохиргоо уншихдаа `SettingsService.get('creditPriceMnt')`. Шинэ тохиргоо: `apps/api/src/admin/settings.registry.ts` + `SettingKey`.
- Админы өөрчлөлт бүрийг `AuditService.record(tx, …)`-аар өөрчлөлттэй **нэг transaction-д** бичнэ.
- Хууль эрх зүйн баримт: `/admin/legal`-д ноорог → нийтлэх. Нийтэд `/legal/terms`, `/legal/privacy`, `/legal/teacher-agreement`.

## Курс ба файл

- Курсийн төлөв: `DRAFT → IN_REVIEW → PUBLISHED | REJECTED`. Нийтлэгдсэн курсийн шинэ хичээл тусдаа шалгагдана; нийтлэгдсэн хичээлийн агуулга түгжигдэнэ.
- Шинэ хичээлийн төрөл: `apps/api/src/catalog/lesson-types.ts`-д entry + `AVAILABLE_LESSON_TYPES`.
- Файл: API `UploadTicket` (signed URL) өгнө → browser шууд PUT → API `info()`-оор шалгаж хүлээн авна. `SUPABASE_URL` хоосон бол local диск.

## Каталог

- Нийтэд (`/catalog/*`, нэвтрэлтгүй) зөвхөн `PUBLISHED` курс, `APPROVED` + архивлаагүй lesson. Бусад нь 404.
- Lesson-ы контентыг өгөх цорын ганц шалгалт: `LessonAccessPolicy.access(lesson, viewer)` / `canViewContent()` (`apps/api/src/catalog/lesson-access.ts`) — админ → курсийн багш → эзэмшил → free preview. Mux token, live линк, quiz асуулт г.м шинэ контент бүр үүгээр шалгана.
- `GET /catalog/courses/:id`, `GET /catalog/lessons/:id` нь optional auth (`@OptionalAuth()` + `@Viewer()`, `apps/api/src/auth/auth.guard.ts` — хэзээ ч 401 өгөхгүй): нэвтэрсэн бол хувийн үнэ (`pricing.payableCredits`), `viewer` (эзэмшил), эрхтэй контент. Web SSR access cookie-г API руу дамжуулна (`apps/web/lib/catalog.ts`).
- `pg_trgm` нь `extensions` schema-д — SQL-д үргэлж бүрэн нэрээр: `extensions.word_similarity(...)`, `OPERATOR(extensions.<%)`, `extensions.gin_trgm_ops`. Raw SQL зөвхөн `Prisma.sql` tagged template-ээр.
- Үнэлгээ (шүүлтүүр, эрэмбэ, карт): `apps/api/src/catalog/ratings.ts`.
- Migration SQL үүсгэх (`migrate diff`) үед `DIRECT_URL`-ийг ч тестийн schema руу заана — эс бөгөөс Prisma `directUrl` (dev `public`)-тэй харьцуулна:
  `cd packages/db && npx dotenv -e ../../.env -- sh -c 'DATABASE_URL="$DATABASE_URL_TEST" DIRECT_URL="$DATABASE_URL_TEST" npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script'`

## Мэдэгдэл ба дараалал

- Мэдэгдэл илгээх цорын ганц арга: `NotificationsService.notify({ userId, type, params, link })`. Имэйлтэй бол имэйл автоматаар дараалалд орно.
- Мэдэгдлийн текст: `apps/api/src/i18n/mn.json` → `notifications.<TYPE>`.
- Арын ажил: `JobQueue`-д `register(name, handler, { attempts, backoffMs })`, `add()`, cron бол `schedule(name, '30 3 * * *')` (Улаанбаатарын цагаар).
- `REDIS_URL` хоосон бол dev-д process доторх дараалал (cron ажиллахгүй). Тестэд `t.queue.drain()` / `t.queue.runScheduled(name)`.

## Кредит ба төлбөр

- Балансыг өөрчлөх **цорын ганц** арга: `CreditsService` (`apps/api/src/credits/credits.service.ts`, global). `credit_lots` / `credit_ledger_entries`-д шууд бичихгүй.
- Зарцуулах (ticket 09): өөрийн бичилтүүдтэй **нэг transaction-д**:
  ```ts
  await prisma.$transaction(async (tx) => {
    const spent = await credits.spend(tx, { userId, credits: n, refType: 'lesson', refId: lessonId });
    // entitlement, багшийн орлого… (spent.isTest — тест кредит эсэх)
  }, CREDIT_TX_OPTIONS);
  ```
  Хүрэлцэхгүй бол `INSUFFICIENT_CREDITS` (409) шидэж, transaction бүхэлдээ буцна. FIFO: хамгийн эрт дуусах lot-оос.
- Олгох (ticket 17): `credits.grant(tx, { userId, credits, source: 'SUBSCRIPTION_GRANT', paymentId })` — lot нь `creditValidityMonths` тохиргоогоор дуусна; нэг `paymentId` нэг л lot (unique).
- Дуусгавар (ticket 16): өдөр бүр 00:10 cron `credits.expiry` (`CreditExpiryService`) → `credits.expireDueLots(now)` (idempotent, `EXPIRE` бичилт) + 30/7 хоногийн сануулга (`credit_lots.remind_{30,7}_sent_at`, хэрэглэгч бүрт нэгтгэсэн `CREDITS_EXPIRING` / `CREDITS_EXPIRED` мэдэгдэл). Админ засвар: `credits.adjust({ userId, delta, reason, actorId })` (audit + `ADMIN_ADJUST`).
- Бүх өөрчлөлт хэрэглэгчийн мөрийг (`users … FOR NO KEY UPDATE`) түгжинэ → зэрэг зарцуулалт сөрөг баланс үүсгэхгүй. Transaction-д `CREDIT_TX_OPTIONS` (урт timeout) өгнө.
- QPay: `QPAY_*` хоосон бол dev-д fake (нэхэмжлэх шууд төлөгдсөнд тооцогдоно → `/credits` дээр "Төлбөр шалгах"). Callback-д итгэхгүй — үргэлж `POST /v2/payment/check`-ээр дахин шалгана. Тестэд `t.qpay.markPaid(invoiceId)`.
- Тест багц (`isTest`) зөвхөн админд; түүний төлбөр, lot, ledger `isTest = true` — тайланд тусад нь.

## Худалдан авалт ба багшийн орлого

- Худалдан авах цорын ганц арга: `PurchasesService.buyLesson / buyCourse` (`apps/api/src/purchases/`). Нэг transaction (`CREDIT_TX_OPTIONS`): хэрэглэгчийн мөр түгжих → эзэмшил, үнэ шалгах → `credits.spend` → `purchases` (үнэ, шимтгэл, attribution) → `entitlements` (+ бүтэн курс бол `course_entitlements`) → `teacher_earning_entries`. API: `POST /purchases/lessons/:id`, `POST /purchases/courses/:id` body `{ confirmNoRefund: true, expectedCredits }`; `GET /purchases`; багш `GET /teacher/earnings`.
- Эзэмшил шалгах: `ownsLesson(db, userId, lesson)`, `courseOwnership(db, userId, courseId)` (`apps/api/src/purchases/entitlements.ts`). Эзэмшил = lesson-ы `Entitlement` ЭСВЭЛ курсийн `CourseEntitlement` (бүтэн курс авсны дараа зөвшөөрөгдсөн lesson-ууд мөргүйгээр нээгдэнэ) — `entitlements` хүснэгтийг дангаар нь бүү тоол.
- Курсийн үнэ = `max(0, курсийн үнэ − энэ курсийн lesson-д ширхэгээр зарцуулсан кредит)`; 0 бол кредит, орлогогүйгээр эрх үүснэ.
- Багшийн орлого: `TeacherEarningsService` (`earnings.service.ts`) — `recordSale` (худалдан авалтын tx дотор), `append(tx, { type: 'PAYOUT' | 'ADMIN_ADJUST', amountMnt })`, `balance(teacherId)` (тест бичилтгүй нийлбэр). Дүн = `floor(кредит × creditPriceMnt × (100 − шимтгэл%) / 100)`; бутархай платформд. Үнэ, шимтгэл, attribution бичилт бүрт хадгалагдана — тохиргоо өөрчлөгдсөн ч түүх зөв.
- Attribution: `PurchasesService.attribution()` одоогоор үргэлж `PLATFORM` (`commissionPlatformPercent`); ticket 11 `REFERRAL` + `referrerId` буцааж `commissionReferralPercent` хэрэглэнэ.
- Тест lot-оос зарцуулсан худалдан авалт, орлого `isTest` — payout үлдэгдэлд орохгүй.

## Видео (Mux)

- `apps/api/src/media/`; Mux-ийг `MUX` adapter-аар (`apps/api/src/adapters/mux.ts`), тестэд `FakeMux` (`t.mux.signedWebhook(event)`, `t.mux.setUpload/setAsset`). `MUX_*` хоосон бол dev-д видео 503 `VIDEO_UNAVAILABLE`.
- Upload: `POST /teacher/lessons/:id/video-upload` → Mux direct upload URL (browser шууд `PUT`); мөр `lesson_videos` (id = Mux `passthrough`). Төлөв: `POST /webhooks/mux` (гарын үсэг, event id-аар давхардалгүй `mux_webhook_events`) → `mux.webhook` ажил; эсвэл `POST /teacher/lessons/:id/video-sync` (Mux API). `lessons.content` дахь төлөв/хугацааг зөвхөн `VideoService` бичнэ.
- Тоглуулах: `POST /media/lessons/:id/playback { deviceId }` — `LessonAccessPolicy` + зэрэг ≤ 2 төхөөрөмж (Redis sorted set, heartbeat `POST /media/playback/heartbeat`, `/stop`) → 15 минутын signed JWT, watermark (`9911****`), Mux Data metadata. Тестэд `t.playback.advance(ms)`.

## Сарын багц (subscription)

- Модуль: `apps/api/src/subscriptions/`. Төлөвийн машин нэг газар — `state.ts` (`TRANSITIONS`, `USER_ACTIONS`): `INCOMPLETE → ACTIVE → PAST_DUE (3 хоног) → PAUSED`, `CANCELED`; буруу шилжилт `409 INVALID_SUBSCRIPTION_TRANSITION`.
- Төлбөр нь `payments` хүснэгт (`purpose = SUBSCRIPTION`, `method = INVOICE | CARD`), callback `…/payments/qpay/subscription-callback/:token` (кредит цэнэглэлтийн callback энэ төлбөрийг танихгүй). Төлөгдмөгц **нэг transaction-д**: payment `PAID` + `subscription_periods` мөр + `SUBSCRIPTION_GRANT` lot + үе урагшилна. Нэг үе (subscription, starts_at) болон нэг төлбөр нэг л удаа.
- Сунгалт: cron `subscriptions.renew` өдөр бүр 09:00 (`SubscriptionsService.runRenewals(now)`) — idempotent, зэрэг ажиллахад аюулгүй. Тестэд `t.queue.runScheduled('subscriptions.renew')`, хугацааг DB-д `current_period_end` / `past_due_since`-ийг ухрааж дуурайна.
- Карт холбох: QPay-ийн нийтийн баримтад card-token API **алга** → бодит adapter `cardTokensSupported = false`, бүх төлбөр нэхэмжлэхээр. Fake-д (dev/тест) карт ажиллана: `t.qpay.completeCard(registrationId)`, `t.qpay.declineNextCharge()`.
- Web: `/subscription` (хэрэглэгч), `/admin/subscription-plans` (админ, audit).

## Сертификат

- `CertificatesService` (`apps/api/src/learning/certificates.service.ts`): нөхцөл (бүтэн курс эзэмшил + архивлаагүй APPROVED VIDEO/TEXT/PDF/QUIZ бүгд дууссан + quiz дундаж ≥ 70% + нэртэй). Lesson дуусах үед `issueIfEligible()` автоматаар олгоно; бусад үед `POST /learning/courses/:id/certificate`.
- `certificates` мөр өөрчлөгдөхгүй (DB trigger) — нэр, курс, багшийг олгох мөчийнхөөр хадгална. PDF-ийг хүсэлт бүрт үүсгэнэ (`certificate-pdf.ts`, `pdfkit` + `qrcode`, Noto Sans фонт `apps/api/assets/fonts` — монгол кирилл). Deploy-д `apps/api/assets/` хамт явах ёстой.
- Нийтийн шалгалт: API `GET /certificates/verify/:code`, web `/verify/<code>` (QR энд заана, `PUBLIC_WEB_URL`).

## Нууц түлхүүр

`.env` git-д орохгүй. Production-д Vercel/Railway-ийн environment variables-д тохируулна. Шаардлагатай хувьсагчдыг `.env.example`-ээс харна уу.
