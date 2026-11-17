# 17: Subscription

**What to build:** Хэрэглэгч админаас тохируулсан сарын багцад бүртгүүлж, сар бүр кредит авна. QPay-д карт холбосон бол автоматаар төлөгдөнө; холбоогүй эсвэл амжилтгүй бол QPay нэхэмжлэх очно. 3 хоногийн дотор төлөөгүй бол түр зогсоно. Хүссэн үедээ цуцалж, энэ сарын кредит үлдэнэ.

**Blocked by:** 03, 08

**Status:** done — QPay карт токены API батлагдаагүй (бодит орчинд зөвхөн нэхэмжлэх), доорх "Үлдсэн"

> Шийдвэр: Төлөвийн машин нэг газар (`apps/api/src/subscriptions/state.ts`): `INCOMPLETE → ACTIVE`, `ACTIVE → ACTIVE (сунгалт) | PAST_DUE | CANCELED`, `PAST_DUE → ACTIVE | PAUSED | CANCELED`, `PAUSED → ACTIVE | CANCELED`, `CANCELED → ACTIVE`. Хэрэглэгчийн үйлдлүүд (`USER_ACTIONS`): start (байхгүй/INCOMPLETE/PAUSED/CANCELED), reactivate (PAUSED/CANCELED), cancel (CANCELED-ээс бусад), pay (PAST_DUE). Буруу үед `409 INVALID_SUBSCRIPTION_TRANSITION`. `INCOMPLETE` нэмсэн — анхны төлбөр орохоос өмнөх төлөв.
>
> Шийдвэр: Хэрэглэгч бүрт нэг `subscriptions` мөр (`user_id` unique) — дахин идэвхжүүлэх/өөр багц сонгоход ижил мөр. Дахин идэвхжүүлэхэд шинэ үе **төлбөр орох мөчөөс** эхэлнэ; PAUSED/CANCELED төлөв төлбөр орох хүртэл хэвээр.
>
> Шийдвэр: Төлбөр нь `payments` хүснэгт (`purpose = SUBSCRIPTION`, `method = INVOICE | CARD`, `subscription_id`, `plan_id`, `renewal_for`). Өөрийн callback `/payments/qpay/subscription-callback/:token` (32 байт токен, body-д итгэхгүй, `POST /v2/payment/check`-ээр дахин шалгана). Кредит цэнэглэлтийн `PaymentsService` нь `purpose ≠ CREDIT_TOPUP` төлбөрийг танихгүй (callback 404, `/credits/topups/:id` 404).
>
> Шийдвэр: Exactly-once — төлөгдсөн төлбөр бүр **нэг transaction-д** (subscription мөрийг `FOR UPDATE` түгжээд): `PENDING → PAID` нөхцөлт update + `subscription_periods` (unique `(subscription_id, starts_at)` ба `payment_id`) + `CreditsService.grant(tx, { source: 'SUBSCRIPTION_GRANT', paymentId })` (lot-ын `payment_id` unique) + үе урагшилна. Давхар/зэрэг callback, хэрэглэгчийн шалгалт, давхар cron аль нь ч нэг л удаа.
>
> Шийдвэр: Сунгалтын cron `subscriptions.renew` өдөр бүр 09:00 (Улаанбаатар). (1) ACTIVE, үе дууссан → нөхцөлт update-ээр `PAST_DUE` болгож "эзэмшинэ" (зэрэг ажлаас нэг л нь), картаар оролдоно → амжилттай бол ACTIVE (үе тасралтгүй — хуучин төгсгөлөөс), үгүй бол нэхэмжлэх + `SUBSCRIPTION_PAYMENT_FAILED`. (2) PAST_DUE → нээлттэй нэхэмжлэхийг QPay-ээс шалгана (callback алдагдсан бол олгоно); 3 хоног хэтэрсэн бол нэхэмжлэхийг цуцалж `PAUSED` + мэдэгдэл; нэхэмжлэх алга (QPay түр унасан) бол 10 мин-ээс хойш дахин үүсгэнэ. Нэг сунгалтад нээлттэй/төлөгдсөн нэхэмжлэх нэг л байна — partial unique index `payments_subscription_renewal_invoice_key` (migration-д raw SQL; `migrate diff` drift үүсгэхгүйг шалгасан).
>
> Шийдвэр: Хэрэглэгчийн start/reactivate/cancel нь `updated_at`-аар optimistic түгжинэ → зэрэг дарахад нэг нь л (давхар картаар татахгүй), бусад нь `409 SUBSCRIPTION_BUSY`.
>
> Шийдвэр: Цуцлах/зогсоох/дахин эхлэхэд нээлттэй нэхэмжлэхийг: QPay дээр цуцлах (`DELETE /v2/invoice/{id}`) → дахин шалгах (өмнө нь төлөгдсөн бол олгоно) → PENDING хэвээр бол `CANCELED` (шинэ `PaymentStatus`). Цуцлахад олгосон кредит хэвээр; хандалтыг тусад нь хаадаггүй (кредит л).
>
> Шийдвэр: Багцын үнэ/кредит өөрчлөхөд одоо байгаа бүртгэлийн дараагийн сунгалтад хэрэгжинэ; идэвхгүй багц зөвхөн шинэ бүртгэлд харагдахгүй (одоогийнх сунгагдсаар). Ашиглагдсан багц устгахгүй (`409 PLAN_IN_USE`).
>
> Шийдвэр: Карт — зөвхөн QPay-ийн токен + маск дугаар (`payment_cards`), токен API-д хэзээ ч буцахгүй. Холбох урсгал: `POST /subscription/card` → QPay hosted хуудас (`redirectUrl`) → буцаж ирэхэд `POST /subscription/card/check`. Карт татгалзсан/QPay алдаа → төлбөр `FAILED` (`failure_reason`) ба нэхэмжлэх рүү шилжинэ.

- [x] Админ plan CRUD (үнэ, сарын кредит) — `/admin/subscription-plans` (API + web), audit `subscription_plan.create|update|delete`
- [x] Төлөв: active → past_due (3 хоног) → paused; canceled (+ `INCOMPLETE`)
- [ ] QPay карт холбох + токеноор автомат төлбөр — interface, урсгал, UI, fake бүрэн; бодит QPay-д API батлагдаагүй (доорх "Үлдсэн")
- [x] Нэхэмжлэх fallback (QR + банкны deeplink + "Төлбөр шалгах", 4с polling)
- [x] Амжилттай төлбөр бүр `SUBSCRIPTION_GRANT` lot үүсгэнэ (нэг transaction-д)
- [x] Renewal cron idempotent (давхар, зэрэг ажилд нэг л удаа)
- [x] Цуцлах, дахин идэвхжүүлэх (өөр багцаар ч)
- [x] Мэдэгдлүүд (in-app + имэйл): `SUBSCRIPTION_ACTIVATED`, `SUBSCRIPTION_RENEWED`, `SUBSCRIPTION_PAYMENT_FAILED` (нэхэмжлэх илгээсэн), `SUBSCRIPTION_PAUSED`, `SUBSCRIPTION_CANCELED`
- [x] Integration тест: state machine бүх шилжилт (буруу нь 409), нэхэмжлэх/картаар эхлэх, сунгалт, PAST_DUE → PAUSED, PAST_DUE үед төлөх, цуцлах (кредит үлдэх, сунгалт зогсох), дахин идэвхжүүлэх, давхар/зэрэг cron ба callback, хуурамч callback, эрх, audit (`subscriptions.spec.ts`, 11 тест; `qpay-adapter.spec.ts` +2)

API: `GET /subscription`, `GET /subscription/plans`, `POST /subscription` (`planId`), `POST /subscription/reactivate`, `POST /subscription/cancel`, `POST /subscription/pay`, `GET /subscription/payments/:id`, `POST /subscription/payments/:id/check`, `POST /subscription/card`, `POST /subscription/card/check`, `DELETE /subscription/card`, `GET|POST /payments/qpay/subscription-callback/:token`, `GET|POST /admin/subscription-plans`, `PATCH|DELETE /admin/subscription-plans/:id`.

QPay карт токен — эх сурвалж (2026-11-17): developer.qpay.mn-д зөвхөн Merchant V2 (`/v2/auth/token|refresh`, `/v2/invoice` POST, `DELETE /v2/invoice/{invoice_id}`, `GET /v2/payment/{id}`, `/v2/payment/check`, `/v2/payment/cancel|refund/{id}`, `/v2/payment/list`, `/v2/ebarimt_v3/*`), Quick QR (merchant бүртгэл, invoice, check), eBarimt 3.0. Карт хадгалах, токеноор төлөх, recurring endpoint **алга**; албан ёсны Postman collection олдсонгүй. Баталсан: `DELETE /v2/invoice/{invoice_id}` (`cancelInvoice`). Таамаг (бүгд): карт бүртгэлийн hosted хуудас → `registrationId`, бүртгэлийн төлөв + токен, токеноор синхрон charge (`PAID | DECLINED`, `sender_invoice_no`-оор idempotent), токен устгах. `HttpQPayAdapter.cardTokensSupported = false`, 4 арга `QPayCardNotSupportedError` → UI "удахгүй", сунгалт бүр нэхэмжлэхээр.

## Үлдсэн

- [ ] QPay-ээс card-token (recurring/tokenization) API-ийн албан ёсны баримт, гэрээ авах → `HttpQPayAdapter`-ийн `registerCard/getCardRegistration/chargeCard/removeCard`-ийг хэрэгжүүлж, `cardTokensSupported = true`, local HTTP сервертэй тест. Түүнийг хүртэл бодит орчинд карт холбох боломжгүй.
- [x] Картаар татагдсан ч олголтын transaction унасан төлбөр `PENDING` + `provider_payment_id`-тай үлдэнэ — админд харуулж гараар шийдэх UI (ticket 22, хуучирсан PENDING / `AMOUNT_MISMATCH`-тэй хамт).
- [x] QPay дээр нэхэмжлэх цуцлах амжилтгүй болж, дараа нь хэрэглэгч төлвөл (`CANCELED` төлбөр) кредит олгогдохгүй — ticket 22-ийн тохирлын (reconciliation) тайланд.
- [ ] Production-д бодит QPay-ээр сарын багцын нэхэмжлэх, callback, 3 хоногийн урсгалыг шалгах (тест багц одоогоор зөвхөн кредит цэнэглэлтэд).
- [x] Сунгалтын өмнөх сануулга (ticket 25): өдөр бүрийн `subscriptions.renew` cron-ийн төгсгөлд `runRenewalReminders` — ACTIVE багцад, үе дуусахаас `subscriptionReminderDays` (админ тохиргоо, анхдагч 3, Улаанбаатарын өдрөөр) хоногийн өмнө. Үе бүрт нэг: `subscriptions.renewal_reminded_for` = `current_period_end`-ийг нөхцөлт updateMany-ээр claim (илгээж чадаагүй бол буцаана). Карт холбосон бол `SUBSCRIPTION_RENEWAL_REMINDER_CARD` (автоматаар татагдана), үгүй бол `..._INVOICE` (QPay нэхэмжлэх); цуцалсан/зогссон/хоцорсон алгасна. Migration `20261117920000_small_features` (dev-д deploy: 2026-11-18). 4 тест (`subscriptions.spec.ts`).
