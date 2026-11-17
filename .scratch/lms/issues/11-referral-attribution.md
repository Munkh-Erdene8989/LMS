# 11: Referral ба attribution

**What to build:** Багш бүр өөрийн referral линктэй. Хэрэглэгч тэр линкээр орж ирсэн бол тохиргоонд заасан хугацаанд (анхдагч 30 хоног) тухайн багшийн курсийн худалдан авалт teacher-referral (10%) шимтгэлтэй болно. Бусад нь platform-sourced (40%).

**Blocked by:** 09

**Status:** done

> Шийдвэр: Багш бүрт нэг тогтмол код (`referral_codes`, 8 тэмдэгт, андуурагдах 0/o/1/l/i-гүй) — `GET /teacher/referral` анх дуудахад үүснэ. Линк `/r/<code>` (сонголтоор `?next=/courses/…`). TEACHER эрхээ алдсан багшийн код 404.
>
> Шийдвэр: Бүртгэл (хэрэглэгч, багш) хос бүрт нэг мөр (`referral_attributions`, `first_seen_at`, `last_seen_at`). Дахин орвол `last_seen_at` шинэчлэгдэнэ → хугацааг **хамгийн сүүлд орсноос** тоолно. Олон багшийн линкээр орсон бол хос бүр тусдаа — referral нь зөвхөн тухайн багшийн өөрийн курст (DB CHECK `purchases.referrer_id = teacher_id`). Багш өөрийн линкээр орвол бүртгэхгүй (CHECK `user_id <> teacher_id`).
>
> Шийдвэр: Нэвтэрсэн хэрэглэгч `POST /referrals/visit` → шууд DB. Зочинд HttpOnly cookie `lms_ref` = `<teacherId>.<ms>.<HMAC(JWT_SECRET)>` (Max-Age = window) — огноог засаж хугацаа сунгах боломжгүй, хуурамчийг үл тооно. Cookie-г OTP нэвтрэлтийн дараа (`claimCookieSafe`, алдаа нэвтрэлтэд нөлөөлөхгүй) болон худалдан авалтын transaction дотор DB-д шилжүүлнэ (cookie-ийн огноогоор, `skipDuplicates` → зэрэг бичилт transaction-ийг унагахгүй). Cookie зөвхөн хамгийн сүүлийн багшийг хадгална (зочин олон багшийн линкээр орвол сүүлийнх нь).
>
> Шийдвэр: Худалдан авалтын transaction дотор (`ReferralsService.attribution`) курсийн багштай хосын `last_seen_at ≥ now − referralWindowDays` бол `REFERRAL` + `referrer_id`, шимтгэл `commissionReferralPercent`; үгүй бол `PLATFORM` + `commissionPlatformPercent`. Хувь, хугацаа админ тохиргооноос (ticket 04) худалдах мөчид уншигдаж `purchases` ба `teacher_earning_entries`-д (`attribution`, `commission_percent`) хадгалагдана — дараа өөрчлөгдсөн ч түүх хэвээр (тестээр баталсан). 09-ийн `PurchasesService.attribution()` placeholder-ийг `ReferralsService` руу шилжүүлсэн.

- [x] Багшийн dashboard-д referral линк (`/teacher/referral`: хуулах товч, хувь/хугацаа, линкээр орсон хэрэглэгч, referral/платформ борлуулалтын тоо; `/me`-ээс линк)
- [x] Линкээр орсныг cookie + (нэвтэрсэн бол) DB-д бүртгэнэ
- [x] Худалдан авалт бүр attribution-ийг хадгална (`purchases.attribution/referrer_id/commission_percent`, `teacher_earning_entries.attribution`)
- [x] Хувь, хугацааг тохиргооноос авна (`commissionReferralPercent`, `commissionPlatformPercent`, `referralWindowDays`)
- [x] Integration тест (`referrals.spec.ts`, 10 тест): хугацаанд (10%, орлого 90%), хугацаа өнгөрсөн (31 хоног → 40%; админ 60 хоног болговол REFERRAL, хуучин бичилт хэвээр), өөр багшийн курс (PLATFORM), дахин орвол хугацаа шинэчлэгдэх, зочны cookie → нэвтрэлт → REFERRAL, худалдан авах үеийн cookie шилжүүлэлт, хуурамч/огноо зассан cookie, өөрийн линк, буруу код/эрхгүй багш, эрх (401/403)

API: `GET /teacher/referral` (TEACHER; `code`, `path`, `windowDays`, хувиуд, `stats`), `POST /referrals/visit` (optional auth; `{ code }` → `{ teacherId }`, зочинд `lms_ref` cookie; буруу код 404 `REFERRAL_NOT_FOUND`). Migration `20261117800000_referrals`.

Web: `/r/[code]` (visit → багшийн profile эсвэл `?next=` руу), `/teacher/referral`.

## Үлдсэн

- [x] `public` (dev) schema-д migration-ийг `pnpm db:deploy`-оор хэрэгжүүлэх.
- [x] Ticket 21: багшийн analytics-д referral/платформ харьцааг (`purchases.attribution`) дэлгэрэнгүй (одоо `/teacher/referral`-д зөвхөн тоо).
- [ ] Хүсвэл: курсийн хуудсанд багшид "энэ курсийн referral линк хуулах" товч (одоогоор `?next=/courses/<id>`-г гараар нэмнэ).
