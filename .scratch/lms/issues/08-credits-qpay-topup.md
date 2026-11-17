# 08: Кредит ledger ба QPay цэнэглэлт

**What to build:** Хэрэглэгч админаас тохируулсан кредит багцыг сонгож QPay нэхэмжлэх (QR + банкны апп deeplink) авч төлнө. Төлбөр баталгаажмагц кредит нэмэгдэнэ. Хэрэглэгч баланс, lot бүрийн дуусах хугацаа, бүх гүйлгээний түүхийг харна. Админд л харагдах 100₮ туршилтын багц бий.

**Blocked by:** 04

**Status:** done — QPay-ийн бодит түлхүүр, production-д 100₮ туршилт үлдсэн (доорх "Үлдсэн")

> Шийдвэр: Баланс = хугацаа дуусаагүй lot-уудын `remaining` нийлбэр (кэш талбар байхгүй). Ledger (`credit_ledger_entries`) append-only, тэмдэгтэй `amount`; аль lot-оос хэд хөдөлснийг `credit_allocations`-д. Нэг худалдан авалт олон lot хамарсан ч түүхэнд нэг мөр.
>
> Шийдвэр: Зэрэгцээ хамгаалалт — кредитийн өөрчлөлт бүр хэрэглэгчийн мөрийг `SELECT … FOR NO KEY UPDATE`-ээр түгжинэ (FK insert-ийн `KEY SHARE`-тэй зөрчилдөхгүй). Нэмэлтээр lot-ыг `remaining >= take` нөхцөлтэй update, DB-д `CHECK (remaining >= 0 AND remaining <= initial)`.
>
> Шийдвэр: `CreditsService.grant/spend` дуудагчийн transaction (`tx`) дотор ажиллана → ticket 09 кредит хасах + entitlement + орлогыг атомараар. `CREDIT_TX_OPTIONS` (maxWait 15с, timeout 30с) — түгжээ хүлээхэд Prisma-гийн анхдагч 5с хүрэлцэхгүй.
>
> Шийдвэр: Callback-ийн body-д итгэхгүй. URL-д 32 байтын таамаглашгүй токен (`/payments/qpay/callback/:token`, GET/POST), ирэхэд `POST /v2/payment/check`-ээр дахин шалгана. Exactly-once: `PENDING → PAID` нөхцөлт update + lot-ын `payment_id` unique, кредит олголттой нэг transaction-д. Төлсөн дүн ≠ нэхэмжлэх → `AMOUNT_MISMATCH`, кредит олгохгүй, system audit `payment.amount_mismatch` + error log.
>
> Шийдвэр: Тест багц = `credit_packages.is_test` (migration-д "Туршилт (100₮)" 1 кредит seed). Админ бус хүнд жагсаалтад харагдахгүй, худалдан авахад 404. Түүний payment, lot, TOPUP бичилт `is_test`; тест lot-оос зарцуулсан SPEND мөн `is_test` (ticket 22 тайланд тусад нь).
>
> Шийдвэр: Payment-д худалдан авах үеийн `amount_mnt`, `credits`, `credit_price_mnt` (тохиргоо) хадгална. Lot-ын хугацаа олгох мөчийн `creditValidityMonths`.
>
> Шийдвэр: `QPAY_*` хоосон dev орчинд `FakeQPay({ autoPay: true })` — нэхэмжлэх шууд төлөгдсөнд тооцогдож "Төлбөр шалгах" дарахад кредит орно. Тестэд `t.qpay` (`markPaid`, `markPaid(id, дүн)`, `failNext`).

- [x] Append-only ledger: `TOPUP`, `SUBSCRIPTION_GRANT`, `SPEND`, `EXPIRE`, `ADMIN_ADJUST` (+ `credit_allocations`)
- [x] Credit lot бүр дуусах хугацаатай (`creditValidityMonths`, анхдагч 12 сар)
- [x] Credits модуль нь балансыг өөрчлөх цорын ганц нэвтрэх цэг (`CreditsService`: `grant`, `spend`, `expireDue`, `adjust`, `balance`)
- [x] Мөнгөн дүн бүхэл тоогоор (Int, DB CHECK)
- [x] QPay adapter: нэхэмжлэх үүсгэх, callback, payment check (`apps/api/src/adapters/qpay.ts`: HTTP — токен cache/refresh, 401-д нэг удаа дахин auth, 15с timeout; `FakeQPay`)
- [x] Callback ирэхэд QPay API-аар дахин шалгана; idempotent (давхар болон зэрэг callback нэг л удаа)
- [x] Callback ирээгүй үед хэрэглэгч "Төлбөр шалгах" (`POST /credits/topups/:id/check`); web 4с тутам төлөв уншина
- [x] Админ кредит багц CRUD (`/admin/credit-packages`, audit); 100₮ test багц зөвхөн админд, гүйлгээ `is_test`
- [x] Баланс, lot, түүх UI (`/credits`), QR + банкны deeplink; админ `/admin/credit-packages` + гар засвар
- [x] Баримтын мэдэгдэл (`CREDIT_TOPUP_PAID` — in-app + имэйл)
- [x] Integration тест: давхар/зэрэг callback, хуурамч callback, хэрэглэгчийн шалгалт, дүн таарахгүй, test flag, FIFO, хүрэлцэхгүй баланс + rollback, зэрэг зарцуулалт, гар засвар + audit, эрх, дуусгавар idempotency (`credits.spec.ts`, 15 тест; `qpay-adapter.spec.ts`, 3 тест — local HTTP сервертэй)

API: `GET /credits`, `GET /credits/history`, `GET /credits/packages`, `POST /credits/topups`, `GET /credits/topups/:id`, `POST /credits/topups/:id/check`, `GET|POST /payments/qpay/callback/:token`, `GET|POST /admin/credit-packages`, `PATCH|DELETE /admin/credit-packages/:id`, `POST /admin/credits/adjust` (`user` = id, утас эсвэл имэйл).

QPay v2 — албан ёсны эх сурвалжаас (developer.qpay.mn, Postman collection) баталсан: base URL `https://merchant.qpay.mn` (sandbox `merchant-sandbox.qpay.mn`), `POST /v2/auth/token` Basic auth, `POST /v2/auth/refresh`, Bearer, `expires_in` нь Unix timestamp (секунд), 401/403 үед нэг удаа дахин token; `POST /v2/invoice` хүсэлтийн талбарууд; `POST /v2/payment/check` (`object_type: INVOICE`, `object_id`, `offset.page_number/page_limit`); callback-ийн дараа payment check хийх зөвлөмж. Гуравдагч SDK-аас (албан ёсны бус): invoice хариу `invoice_id`, `qr_text`, `qr_image`, `qPay_shortUrl`, `urls[{name,description,logo,link}]`; check хариу `count`, `paid_amount`, `rows[{payment_id, payment_status, payment_amount (string), payment_currency}]`. Таамаг: token хариуны талбарын нэр (`access_token`, `refresh_token`, `refresh_expires_in`), refresh нь refresh token-ыг Bearer-ээр илгээх, callback-ийн method, `invoice_receiver_code: "terminal"`.

## Үлдсэн

- [ ] QPay-ээс merchant гэрээ: `QPAY_CLIENT_ID`, `QPAY_CLIENT_SECRET`, `QPAY_INVOICE_CODE`-г Railway-д. Production-д заавал (env шалгалт).
- [ ] Production-д админ 100₮ тест багцаар бодит төлбөр хийж шалгах: QR, банкны deeplink, callback (`PUBLIC_WEB_URL/api/payments/qpay/callback/…` Vercel proxy-оор API-д хүрч байгаа эсэх, эсвэл `QPAY_CALLBACK_BASE_URL`), дээрх таамаглалуудыг батлах.
- [x] Хуучирсан PENDING болон `AMOUNT_MISMATCH` төлбөрийг админд харуулах/шийдвэрлэх — ticket 22 (API: `apps/api/src/admin-ops/payment-reconciliation.service.ts`; UI хуудас үлдсэн).
- [x] Хугацаа дуусалтын cron + сануулга — ticket 16.
