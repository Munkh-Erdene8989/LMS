# LMS — Онлайн сургалтын платформ (Spec)

> Түр нэр: `lms`. Брэнд нэр, домэйн нэг тохиргоонд байрлана.
> Энэ баримт нь grill-me ярилцлагын үр дүнд гарсан бөгөөд бүх шийдвэрийг хэрэглэгч баталгаажуулсан.

## Problem Statement

Монголд багш нар онлайн хичээлээ зарах орон нутгийн платформ бараг байхгүй. Udemy, Skool зэрэг гадны платформ QPay-гүй, монгол хэлгүй, монгол хэрэглэгчийн төлбөрийн чадварт тохирохгүй. Суралцагчийн хувьд бүтэн курсийг нэг дор их мөнгөөр худалдаж авах нь эрсдэлтэй: эхний хэдэн хичээл таалагдах эсэхийг мэдэхгүй. Багшийн хувьд өөрийн сурагчдыг авчирсан ч платформд өндөр шимтгэл төлөх нь шударга бус.

## Solution

Монгол зах зээлд зориулсан, marketplace-ийг гол болгосон hybrid LMS:

- Баталгаажсан багш нар курс үүсгэж, админ шалгасны дараа нийтэлнэ.
- Бүх төлбөр **кредит**-ээр хийгдэнэ. Суралцагч lesson-ыг ширхэгээр эсвэл курсийг бүтнээр (хямдралтай) авна. Өмнө нь авсан lesson-ы кредит курсийн бүтэн үнээс хасагдана.
- Кредитийг QPay-ээр цэнэглэх эсвэл subscription-оор сар бүр авна (Audible загвар).
- Багшийн referral линкээр ирсэн суралцагчаас платформ бага (10%), платформын өөрийн суралцагчаас их (40%) шимтгэл авна.
- Багш бүр Skool маягийн community-тэй.

## Үндсэн нэр томъёо (Glossary)

| Нэр томъёо | Утга |
|---|---|
| **Learner** | Хичээл үзэж буй хэрэглэгч |
| **Teacher** | Админ зөвшөөрсөн, курс үүсгэх эрхтэй хэрэглэгч |
| **Admin** | Платформын операторч |
| **Course** | Курс. Section-уудаас бүрдэнэ |
| **Section** | Курсийн бүлэг. Lesson-уудаас бүрдэнэ |
| **Lesson** | Худалдаж авах хамгийн жижиг нэгж: video, text, pdf, quiz, assignment, live |
| **Credit** | Платформын цорын ганц төлбөрийн нэгж. Үнэ нь админаас тохируулагдана (анхдагч 1 кредит = 1,000₮) |
| **Credit lot** | Нэг удаагийн кредит орлого (цэнэглэлт, subscription, гараар нэмсэн). Өөрийн дуусах хугацаатай |
| **Ledger** | Кредит болон багшийн орлогын бүх хөдөлгөөний засагдашгүй бүртгэл |
| **Entitlement** | Learner-ийн тухайн lesson-д нэвтрэх эрх |
| **Attribution** | Худалдан авалт teacher-referral эсвэл platform-sourced эсэх |
| **Earnings balance** | Багшийн гаргаж авах боломжтой орлогын үлдэгдэл (₮) |
| **Payout** | Багшид банкаар гараар шилжүүлэх мөнгө |

## User Stories

### Нэвтрэлт ба аккаунт
1. As a visitor, I want to sign up with my phone number via SMS OTP, so that I can start without a password.
2. As a visitor, I want to sign up with my email via a one-time code, so that I can use the platform without sharing my phone.
3. As a user, I want to add and verify a second identifier (phone or email) to my account, so that I can log in with either.
4. As a user, I want my session to persist securely across visits, so that I don't log in every time.
5. As a user, I want to log out from all devices, so that I can secure my account.
6. As a user, I want to edit my profile (name, avatar), so that teachers and peers recognise me.

### Багшийн бүртгэл
7. As a user with a verified phone, I want to apply to become a teacher with bio, expertise, sample content link and bank account, so that I can sell courses.
8. As an applicant, I want to accept the current teacher agreement, so that my consent is recorded with version and date.
9. As an applicant, I want to see my application status and admin feedback, so that I can fix and resubmit.
10. As an admin, I want a queue of teacher applications, so that I can approve or reject with a reason.

### Курс үүсгэх
11. As a teacher, I want to create a course with title, description, cover image, category, level, so that learners can discover it.
12. As a teacher, I want to organise lessons into sections and reorder them, so that the course has a clear structure.
13. As a teacher, I want to upload a video lesson that is processed by Mux, so that learners can stream it.
14. As a teacher, I want to create text and PDF lessons, so that I can share written materials.
15. As a teacher, I want to build quizzes (single/multiple choice) with a pass score, so that learners can check understanding.
16. As a teacher, I want to create assignments, so that learners can submit work for grading.
17. As a teacher, I want to create live lessons with a date, time and Zoom/Meet link, so that buyers can join live sessions.
18. As a teacher, I want to set a credit price for each lesson and a discounted full-course price, so that learners can buy flexibly.
19. As a teacher, I want to mark lessons as free preview, so that learners can try before buying.
20. As a teacher, I want to submit a course for review, so that it can be published.
21. As a teacher, I want to see admin feedback when my course is rejected, so that I can fix and resubmit.
22. As a teacher, I want to edit a published course (new lessons, changes) with re-review of new lessons, so that content stays fresh without breaking buyers' access.
23. As an admin, I want a course review queue with preview access to all lessons, so that I can approve or reject with notes.

### Каталог ба хайлт
24. As a learner, I want to browse courses by two-level category, so that I find relevant topics.
25. As a learner, I want to filter by price, rating, level and free-preview availability, so that I narrow results.
26. As a learner, I want typo-tolerant Cyrillic search, so that I find courses even with misspellings.
27. As a learner, I want a course page showing curriculum, per-lesson prices, full-course price (minus what I've already paid), teacher info and reviews, so that I can decide what to buy.
28. As a learner, I want a teacher profile page listing their courses, so that I can explore one teacher's work.

### Кредит ба төлбөр
29. As a learner, I want to buy a credit package via QPay invoice (QR / bank app deeplink), so that I can pay with my bank app.
30. As a learner, I want credits to appear immediately after payment is confirmed, so that I can buy lessons right away.
31. As a learner, I want to see my credit balance, each lot's expiry, and full transaction history, so that I trust the system.
32. As a learner, I want to buy a single lesson with credits, so that I pay only for what I need.
33. As a learner, I want to buy a full course with credits, deducting what I've already spent on its lessons, so that I never overpay.
34. As a learner, I want to be told clearly that purchases are non-refundable before confirming, so that I'm not surprised.
35. As a learner, I want the oldest credits used first, so that I lose as few as possible to expiry.
36. As a learner, I want to be notified before my credits expire, so that I can use them.
37. As an admin, I want a hidden 100₮ test credit package visible only to admins, so that I can test QPay in production with real but tiny payments, flagged as test in reports.

### Subscription
38. As a learner, I want to subscribe to a monthly plan that grants credits each month, so that I learn regularly at a discount.
39. As a learner, I want to link my card via QPay for automatic monthly charges, so that renewal is effortless.
40. As a learner without a linked card (or after a failed charge), I want to receive a QPay invoice, so that I can renew manually.
41. As a learner, I want a 3-day grace period after a failed renewal, so that my subscription isn't paused instantly.
42. As a learner, I want to cancel at any time and keep this month's credits, so that I'm not locked in.
43. As an admin, I want to create and edit subscription plans (price, monthly credits), so that I can tune the offer.

### Шимтгэл ба referral
44. As a teacher, I want a personal referral link, so that learners I bring are attributed to me.
45. As a teacher, I want purchases of my courses within 30 days of a learner arriving via my link to carry a 10% commission, so that I keep most of the revenue I generate.
46. As an admin, I want to change commission rates and the referral window from the dashboard, so that I can adjust the business model.

### Сурах үйл явц
47. As a learner, I want "My learning" listing everything I own and my progress, so that I can continue where I left off.
48. As a learner, I want to stream video with protection (signed URL, moving watermark with my partial phone/email), so that the teacher's content is safe.
49. As a learner, I want to be limited to 2 concurrent playback devices, so that sharing accounts is discouraged.
50. As a learner, I want my lesson progress to be tracked automatically, so that I see completion.
51. As a learner, I want to take quizzes and see my score, so that I know my understanding.
52. As a learner, I want to submit assignments as a file (≤50MB) or text, so that the teacher can grade it.
53. As a teacher, I want an assignment inbox where I grade and comment, so that I can give feedback.
54. As a learner, I want to see the live lesson link only if I own that lesson, plus a reminder before it starts, so that I can join on time.
55. As a learner, I want a PDF certificate with QR code when I own the full course, complete all lessons and average ≥70% on quizzes, so that I can prove my achievement.
56. As anyone, I want a public verification page for a certificate code, so that employers can check authenticity.

### Үнэлгээ
57. As a learner who owns ≥30% of a course's lessons, I want to rate it 1–5 and write a review, so that I can help others.
58. As a teacher, I want to reply to reviews in a thread (unlimited replies), so that I can respond to feedback.
59. As an admin, I want to hide inappropriate reviews, so that the platform stays respectful.

### Community
60. As a teacher, I want my own community space with posts, comments, likes and pinned posts, so that I build relationships with learners.
61. As a learner who bought any lesson from a teacher, I want access to that teacher's community, so that I can interact.
62. As a teacher, I want to moderate posts and remove members from my community, so that it stays healthy.
63. As a community member, I want a calendar of the teacher's upcoming live lessons, so that I don't miss them.

### Багшийн аналитик ба payout
64. As a teacher, I want daily/monthly sales charts in credits and ₮, so that I track revenue.
65. As a teacher, I want per-lesson purchase counts, so that I know which lessons sell.
66. As a teacher, I want video watch-time and drop-off data, so that I improve content.
67. As a teacher, I want course completion rates, so that I measure engagement.
68. As a teacher, I want the referral vs platform ratio of my sales, so that I understand where buyers come from.
69. As a teacher, I want to request a payout once my balance reaches 50,000₮, so that I get paid.
70. As a teacher, I want my payout history, so that I can reconcile.
71. As an admin, I want a payout queue where I export bank details, mark payouts as paid, or hold a teacher's payouts, so that I control outgoing money.

### Мэдэгдэл
72. As a user with email, I want emails for purchase receipts, course approval/rejection, payouts, subscription events and live reminders, so that I'm informed.
73. As any user, I want in-app notifications (bell), so that I see updates even without email.

### Админ
74. As an admin, I want to search users, ban them, and manually add/subtract credits with a reason recorded in the ledger, so that I can handle support cases.
75. As an admin, I want to manage categories, credit price, credit packages, subscription plans and commission settings, so that I can run the business.
76. As an admin, I want revenue, credit sales and top-course reports, so that I see how the business is doing.
77. As an admin, I want every admin action recorded in an audit log, so that changes are traceable.
78. As an admin, I want to edit Terms, Privacy Policy and Teacher Agreement pages with versioning, so that legal text stays current.

## Implementation Decisions

### Архитектур
- **Monorepo** (pnpm + Turborepo): web апп (Next.js, Vercel), API апп (NestJS, Railway), өгөгдлийн сангийн package (Prisma schema, migration), shared package (types, zod schema, тогтмол утга).
- Learner, teacher, admin бүгд **нэг Next.js апп**-д, тусдаа route бүлгээр. Бүх эрхийн шалгалт API дээр.
- **Supabase** = зөвхөн Postgres + Storage. Supabase Auth ашиглахгүй.
- **Redis + BullMQ** (Railway): subscription renewal, кредит дуусгавар, live reminder, имэйл илгээх, Mux webhook боловсруулах.
- **Sentry** frontend + backend.
- Орчин: local (Supabase CLI), staging (Vercel/Railway preview + тусдаа Supabase төсөл), production. QPay-д sandbox байхгүй; production-д админы 100₮ test package-аар туршина.
- Интерфейс зөвхөн монгол хэлтэй, i18n бүтэцтэй (бүх текст translation файлаас).

### API модулиуд (NestJS)
- **Auth** — OTP илгээх/шалгах (verify.mn SMS, Resend email), JWT access + refresh token httpOnly cookie-д, identifier холбох.
- **Users** — profile, roles (learner / teacher / admin), ban.
- **TeacherApplications** — өргөдөл, гэрээ зөвшөөрөл (хувилбар + огноо), банкны данс.
- **Catalog** — category, course, section, lesson CRUD, review workflow (draft → in_review → published / rejected), `pg_trgm` хайлт.
- **Media** — Mux direct upload, webhook, signed playback token, watermark мэдээлэл, зэрэг тоглуулалтын хязгаар (Redis-д heartbeat).
- **Credits** — ledger, lot, FIFO зарцуулалт, дуусгавар. **Мөнгөний цорын ганц нэвтрэх цэг**: өөр модуль балансыг шууд өөрчлөхгүй.
- **Payments** — QPay adapter (invoice үүсгэх, callback, payment check, card token charge). Callback ирсний дараа заавал QPay API-аар дахин шалгана; idempotent.
- **Purchases** — lesson / course худалдан авалт, entitlement үүсгэх, attribution тооцох, багшийн орлого ledger-т бичих.
- **Subscriptions** — plan, renewal state machine (`active → past_due (3 хоног) → paused`, `canceled`).
- **Referrals** — referral линк, 30 хоногийн attribution cookie/record.
- **Learning** — progress, quiz оролдлого, assignment submission, grading, certificate (PDF + QR + verify code).
- **Reviews** — rating, threaded reply, hide.
- **Community** — teacher бүрийн space, post, comment, like, pin, moderation, membership (тухайн багшийн lesson эзэмшсэн эсэхээр).
- **Notifications** — in-app + email (Resend). SMS зөвхөн OTP.
- **Payouts** — хүсэлт (≥50,000₮), hold, export, mark paid.
- **Analytics** — багшийн sales, per-lesson, Mux Data, completion, attribution ratio; админы тайлан.
- **Admin** — тохиргоо (settings key-value, хувилбартай), audit log, legal page хувилбар.

### Мөнгөний дүрэм
- Ledger нь **append-only**. Засах бол эсрэг бичилт (reversal) нэмнэ.
- Кредитийн бичилтийн төрлүүд: `topup`, `subscription_grant`, `spend`, `expire`, `admin_adjust`.
- Багшийн орлогын бичилтийн төрлүүд: `sale_earning`, `payout`, `admin_adjust`.
- Кредит lot бүр 12 сарын дуусах хугацаатай; зарцуулалт хамгийн эрт дуусах lot-оос (FIFO).
- Худалдан авалт нэг DB transaction-д: кредит хасах + entitlement + багшийн орлого + attribution. Нэг lesson-ыг хоёр удаа авах боломжгүй (unique constraint).
- Курсийн бүтэн үнэ = `max(0, course_price − тухайн курсийн lesson-д аль хэдийн зарцуулсан кредит)`.
- Багшийн орлого (₮) = зарцуулсан кредит × худалдан авах үеийн кредитийн ₮ үнэ × (1 − шимтгэл). Худалдан авах үеийн шимтгэл, үнийг бичилтэд хадгална (дараа тохиргоо өөрчлөгдсөн ч түүх зөв).
- Буцаалт **байхгүй**. Payout-д хүлээх хугацаа **байхгүй**; админ багшийн payout-ыг hold хийж болно.
- Мөнгөн дүнг бүхэл тоогоор (₮, кредит) хадгална; float ашиглахгүй.
- Test package-аар хийсэн гүйлгээ `is_test` тэмдэгтэй, тайланд тусад нь.

### Эрх (Entitlement) ба хамгаалалт
- Lesson-ы контент (Mux token, PDF signed URL, live линк, quiz асуулт) зөвхөн entitlement эсвэл free preview байгаа үед гарна.
- Mux signed playback token богино хугацаатай; зэрэг тоглуулалт ≤ 2.
- Багш өөрийн курсийг, админ бүх курсийг үзнэ.

### Нэвтрэлт
- OTP: 6 оронтой, 5 минут хүчинтэй, rate limit (identifier болон IP-ээр).
- Худалдан авалт хийхэд ядаж нэг баталгаажсан identifier; багш болоход баталгаажсан утас заавал.

## Testing Decisions

- **Тест хийх seam:** NestJS API-ийн HTTP түвшин (integration тест, бодит Postgres-тэй, supertest). Гадны сервисүүдийг (QPay, Mux, verify.mn, Resend) adapter interface-ийн ард fake-ээр орлуулна. Энэ нь тест хийх цорын ганц seam байна.
- Сайн тест нь зөвхөн гадаад зан төлөвийг шалгана (API хариу, баланс, эрх), дотоод implementation-ийг биш.
- **Заавал тестлэх:** Credits (FIFO, дуусгавар, давхар зарцуулалтгүй), Payments (callback idempotency, дахин шалгалт, test flag), Purchases (курсийн хасалт, attribution, шимтгэлийн тооцоо), Subscriptions (renewal state machine), Payouts (босго, hold), эрхийн шалгалт (entitlement, role).
- Бусад хэсэгт тест бичихгүй (UI, CRUD).
- Prior art: одоогоор codebase хоосон; эхний ticket тестийн суурийг тавина.

## Out of Scope

- Мөнгө буцаах (refund) — бодлогоор байхгүй.
- Автомат payout (банкны API) — гараар шилжүүлнэ.
- Өөрийн live видео систем — Zoom/Meet линк.
- Бүрэн DRM.
- Google OAuth / нууц үгтэй нэвтрэлт.
- Тусдаа төлбөртэй community (Skool шиг сарын хураамж).
- Багшийн тусдаа брэндтэй сургуулийн хуудас / custom domain.
- Англи хэл (i18n бүтэц бэлэн, орчуулга хийхгүй).
- Mobile апп.

## Further Notes

- **Хугацааны эрсдэл:** Бүх функцийг нэг дор, 2–3 сард, нэг хөгжүүлэгч (AI-тай) гаргах шийдвэр гарсан. Ticket-үүдийг dependency дарааллаар, мөнгөний цөмийг эхэнд хийнэ.
- **Хуулийн:** QPay гэрээ хувь хүний нэр дээр. Бусдын орлогыг дамжуулах, татвар суутгалын асуудлыг нягтлан бодогчоос тодруулах (хэрэглэгчийн хариуцлага).
- **Хууль эрх зүйн текст** (ҮН, нууцлал, багшийн гэрээ)-ийг хэрэглэгч эсвэл хуульч бичнэ; систем зөвхөн хувилбартай хадгалж, зөвшөөрлийг бүртгэнэ.
