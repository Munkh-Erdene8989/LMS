# 09: Худалдан авалт (lesson / курс), эрх ба багшийн орлого

**What to build:** Хэрэглэгч курсийн хуудаснаас lesson-ыг ширхэгээр эсвэл курсийг бүтнээр кредитээр авна. Курсийн үнээс тухайн курсийн lesson-д аль хэдийн зарцуулсан кредит хасагдана. Буцаалтгүй гэдгийг баталгаажуулахаас өмнө харуулна. Худалдан авалт эрх (entitlement) үүсгэж, багшийн орлогыг шимтгэл хассан дүнгээр бичнэ (attribution анхдагч нь platform-sourced, 40%).

**Blocked by:** 07, 08

**Status:** done — referral attribution (ticket 11), payout (ticket 20)-ийн холбох цэгүүд бэлэн (доорх "Үлдсэн")

> Шийдвэр: Нэг transaction (`CREDIT_TX_OPTIONS`): хэрэглэгчийн мөрийг `FOR NO KEY UPDATE`-ээр түгжих (CreditsService-тэй ижил түгжээ) → эзэмшил, үнийг түгжээний ДАРАА уншиж шалгах → `credits.spend` (FIFO) → `purchases` → `entitlements` / `course_entitlements` → `teacher_earning_entries`. Нэг хэрэглэгчийн зэрэг худалдан авалтууд дараалж, давхар эзэмшил, хэт зарцуулалт гарахгүй. Сүүлчийн хамгаалалт: unique (user, lesson), (user, course) — P2002 → 409 `ALREADY_OWNED`. CreditsService-ийн гарын үсэг өөрчлөгдөөгүй.
>
> Шийдвэр: Бүтэн курс = одоогийн `APPROVED`, архивлаагүй, эзэмшээгүй lesson бүрт `Entitlement` + курсийн `CourseEntitlement`. Дараа нь зөвшөөрөгдөх шинэ lesson-ууд `CourseEntitlement`-ээр (мөр нэмэлгүйгээр) нээгдэнэ — "бүтэн курс" гэдэг нь курсийн бүх агуулга. Тиймээс эзэмшлийг ЗӨВХӨН `purchases/entitlements.ts` (`ownsLesson`, `courseOwnership`)-оор шалгана.
>
> Шийдвэр: Курсийн үнэ = `max(0, курсийн үнэ − энэ курсийн lesson-д LESSON худалдан авалтаар зарцуулсан кредит)` (`purchases.credits`-ийн нийлбэр — архивласан lesson-д төлсөн ч тооцогдоно). Үнэ 0 бол кредит хасалт, орлогогүй, `credits = 0` purchase + эрх үүснэ. `priceCredits = null` курс бүтнээр зарагдахгүй (409 `COURSE_NOT_FOR_SALE`).
>
> Шийдвэр: Орлого (₮) = `floor(кредит × creditPriceMnt × (100 − шимтгэл%) / 100)` — бүхэл тоо, бутархай (< 1₮) платформд. Purchase болон SALE_EARNING бичилт бүр худалдах мөчийн `credit_price_mnt`, `commission_percent`, `gross_mnt`, `attribution`-ыг хадгална (тохиргоо өөрчлөгдсөн ч түүх зөв — тестээр баталсан). 100% шимтгэл → 0₮ тул орлогын бичилтгүй (DB CHECK `amount_mnt <> 0`).
>
> Шийдвэр: Attribution — `purchases.attribution` (`PLATFORM` | `REFERRAL`, анхдагч PLATFORM) + `referrer_id` (DB CHECK: REFERRAL ⇔ referrer). `PurchasesService.attribution(tx, userId, teacherId)` нэг газар; ticket 11 үүнийг бөглөхөд шимтгэл автоматаар `commissionReferralPercent` болно.
>
> Шийдвэр: Буцаалтгүй баталгаажуулалт API түвшинд заавал: body `{ confirmNoRefund: true, expectedCredits }`. `confirmNoRefund` ≠ true → 400 `NO_REFUND_NOT_CONFIRMED`; хэрэглэгчийн харсан үнэ одоогийнхоос өөр → 409 `PRICE_CHANGED` (юу ч бичигдэхгүй). Худалдан авалтад баталгаажсан identifier заавал (SPEC; 403 `IDENTIFIER_REQUIRED`).
>
> Шийдвэр: Free preview lesson-ыг ч худалдаж авч болно (эзэмшил нь сертификат, review-ийн 30%, community-д тооцогдоно); бүтэн курсэд ч орно. Өөрийн курсийг авах боломжгүй (403 `OWN_COURSE`). Нийтлэгдээгүй курс, шалгагдаагүй/буцаагдсан/архивласан lesson → 404.
>
> Шийдвэр: Эрх (`LessonAccessPolicy.access`): админ → курсийн багш → эзэмшил → free preview. Контентын хариунд `access` (`PREVIEW` | `OWNED` | `TEACHER` | `ADMIN`). Архивласан lesson нийтэд 404 (preview ч), эзэмшигч, багш, админд хэвээр.
>
> Шийдвэр: Optional auth — `@OptionalAuth()` + `@Viewer()` (`auth.guard.ts`): хүчинтэй access cookie бол хэрэглэгч, үгүй/хуурамч бол зочин; хэзээ ч 401 өгөхгүй. `GET /catalog/courses/:id` хувийн `pricing` (`alreadySpentCredits`, `payableCredits`) + `viewer` (`ownsCourse`, `ownedLessonIds`, `canViewAll`, `isTeacher`). Web SSR зөвхөн `access_token` cookie-г дамжуулна; хугацаа нь дууссан бол client тал `/me`-ээр refresh хийгээд хуудсыг шинэчилнэ.
>
> Шийдвэр: Багшийн орлогын ledger append-only (`SALE_EARNING`, `PAYOUT`, `ADMIN_ADJUST`; тэмдэгтэй ₮). Үлдэгдэл = тест бус бичилтийн нийлбэр (`TeacherEarningsService.balance`); тест lot-оос зарцуулсан худалдан авалт, орлого `is_test` — үлдэгдэлд орохгүй, `testBalanceMnt`-д тусад нь.
>
> Шийдвэр: Баримт — `PURCHASE_LESSON` / `PURCHASE_COURSE` мэдэгдэл (in-app + имэйл, "буцаагдахгүй" гэсэн мөртэй) commit-ийн дараа; илгээлт бүтэлгүйтвэл худалдан авалт хэвээр (log).

- [x] Нэг DB transaction: FIFO кредит хасах + entitlement + багшийн орлого (+ attribution, үнэ, шимтгэл)
- [x] Нэг lesson-ыг давхар авах боломжгүй (түгжээ + unique; зэрэг 5 хүсэлт → яг 1 амжилттай)
- [x] Курсийн үнэ = max(0, курсийн үнэ − аль хэдийн зарцуулсан)
- [x] Багшийн орлого = кредит × худалдан авах үеийн ₮ үнэ × (1 − шимтгэл); үнэ, шимтгэлийг бичилтэд хадгална
- [x] Багшийн орлогын ledger: `SALE_EARNING`, `PAYOUT`, `ADMIN_ADJUST` (`teacher_earning_entries`, DB CHECK-үүд)
- [x] Entitlement шалгалт: контент (PDF URL г.м) зөвхөн эрхтэй эсвэл preview үед гарна
- [x] Багш өөрийн, админ бүх курсийг үзнэ
- [x] Буцаалтгүй анхааруулга + баталгаажуулалт (UI checkbox + API `confirmNoRefund`)
- [x] Кредит хүрэлцэхгүй үед цэнэглэх урсгал руу чиглүүлнэ (`/credits?next=…` → цэнэглээд буцах линк; нэвтрээгүй бол `/login?next=…`)
- [x] Integration тест (`purchases.spec.ts`, 16 тест): курсийн хасалт, 0 үнэтэй дуусгалт, дараа нэмэгдэх lesson, хүрэлцээгүй баланс (юу ч бичигдэхгүй), зэрэг ижил/өөр худалдан авалт, шимтгэлийн тооцоо + тохиргоо өөрчлөгдсөн ч хуучин бичилт, 100% шимтгэл, өөрийн/нийтлэгдээгүй/шалгагдаагүй/архивласан, PRICE_CHANGED, буцаалтгүй баталгаажуулалт, isTest, эрх (зочин/эрхгүй/эзэмшигч/багш/админ/preview/архив), орлогын эрх

API: `POST /purchases/lessons/:id`, `POST /purchases/courses/:id` (body `{ confirmNoRefund: true, expectedCredits }` → `{ purchase, balance }`), `GET /purchases` (`limit`, `before`), `GET /teacher/earnings` (TEACHER; `balanceMnt`, `totalEarnedMnt`, `testBalanceMnt`, `items`, `nextCursor`). `GET /catalog/courses/:id`, `GET /catalog/lessons/:id` optional auth.

Web: `/courses/[id]` (lesson бүрт "Авах"/"Үзэх", үнийн хайрцагт хувийн үнэ + "Курсийг бүтнээр авах"), `/courses/[id]/lessons/[lessonId]` (эрхтэй бол контент, үгүй бол худалдаж авах), баталгаажуулах цонх (үнэ, үлдэгдэл, буцаалтгүй анхааруулга + checkbox, PRICE_CHANGED үед шинэ үнэ), `/teacher/earnings` (`/me`-ээс линк), `/login?next=`, `/credits?next=` буцах линк.

## Үлдсэн

- [x] Ticket 11 (done): `PurchasesService.attribution()`-д referral record/cookie шалгаж `{ source: 'REFERRAL', referrerId }` буцаах (өөр багшийн курс бол PLATFORM).
- [ ] Ticket 20: payout хүсэлт/төлөлтөд `TeacherEarningsService.balance()` ба `append(tx, { type: 'PAYOUT', amountMnt: −дүн, refType: 'payout', refId })`; давхар payout-оос сэргийлж багшийн мөрийг түгжих.
- [ ] Ticket 12 ("Миний сургалт"): эзэмшсэн архивласан lesson-ыг курсийн curriculum-д харуулах (одоо `/catalog/courses/:id` зөвхөн идэвхтэй lesson; архивласан lesson-ы контент endpoint эзэмшигчид ажилладаг).
- [ ] Ticket 21/22: тайланд `purchases` (`teacher_id`, `attribution`, `is_test`) ба `teacher_earning_entries`-ийг ашиглах; админы орлогын гар засвар (`append` `ADMIN_ADJUST` + audit) UI.
- [ ] Багшид "хичээл зарагдлаа" мэдэгдэл — шаардлагатай эсэхийг шийдэх (одоогоор зөвхөн худалдан авагчид баримт).
- [ ] `public` (dev) schema-д migration-ийг `pnpm db:deploy`-оор хэрэгжүүлэх.
