# 02: Нэвтрэлт (утас / имэйл OTP)

**What to build:** Хэрэглэгч утас (verify.mn SMS OTP) эсвэл имэйл (Resend OTP)-ийг сонгож бүртгүүлж, нэвтэрнэ. API JWT access + refresh token-ыг httpOnly cookie-д олгоно. Хэрэглэгч profile-оо засаж, хоёр дахь identifier-ээ холбож баталгаажуулна. Бүх төхөөрөмжөөс гарах боломжтой.

**Blocked by:** 01

**Status:** done — бодит утас/имэйлээр гараар шалгах үлдсэн (доорх "Үлдсэн")

> Өөрчлөлт: verify.mn нь SMS **илгээдэггүй** (mobile-originated). Бид 6 оронтой код үүсгэж verify.mn session нээнэ; хэрэглэгч тэр кодыг өөрийн утаснаас 144773 руу SMS-ээр илгээнэ; web 3 сек тутам `POST /auth/otp/verify`-г дуудаж, API verify.mn-ээс төлөвийг шалгана (SMS ирээгүй бол 202 `pending`). verify.mn callback одоогоор ашиглаагүй (polling хангалттай).
>
> Өөрчлөлт: Browser API руу шууд биш, web-ийн `/api/*` rewrite proxy-оор хандана → cookie first-party (`SameSite=Lax`), Safari-ийн third-party cookie блоклолтод өртөхгүй. API-ийн `COOKIE_PATH_PREFIX=/api`.

- [x] Утсаар OTP авч нэвтэрнэ (verify.mn adapter)
- [x] Имэйлээр OTP авч нэвтэрнэ (Resend adapter)
- [x] OTP 6 оронтой, 5 минут хүчинтэй, нэг удаа ашиглагдана (имэйл кодыг HMAC-аар хадгална, 5 буруу оролдлогын дараа түгжинэ)
- [x] Rate limit: identifier (10 мин-д 3) болон IP (1 цагт 20)-ээр
- [x] Access/refresh token httpOnly cookie, refresh rotation (хуучин refresh дахин ирвэл family бүхэлдээ хүчингүй)
- [x] Хоёр дахь identifier холбох; аль хэдийн өөр аккаунтад байгаа бол татгалзана (код илгээхээс өмнө)
- [x] Profile (нэр, avatar) засах — avatar одоогоор https URL; Storage upload дараагийн ticket-д
- [x] Бүх төхөөрөмжөөс гарах (refresh-ууд + `tokenVersion` → access token шууд хүчингүй)
- [x] Role суурь: learner (анхдагч), teacher, admin — `@Auth('ADMIN')` decorator
- [x] Integration тест: бүртгэл, нэвтрэлт, буруу/хугацаа дууссан OTP, холболт (`apps/api/test/auth.spec.ts`, 31 тест)

**Endpoint-ууд:** `POST /auth/otp/start|verify`, `POST /auth/refresh|logout|logout-all`, `GET|PATCH /me`, `POST /me/identifiers/start|verify`. Web: `/login`, `/me`.

## Үлдсэн

- [ ] **Resend domain баталгаажуулах** (resend.com/domains) ба `EMAIL_FROM`-ийг тэр domain-ий хаягаар солих. Одоо sandbox: зөвхөн Resend аккаунтын эзний имэйл рүү илгээнэ, бусад руу 502 `PROVIDER_UNAVAILABLE`.
- [ ] Бодит утсаар verify.mn урсгалыг гараар шалгах (`pnpm dev` → `/login` → Утас). API түлхүүр, request/response хэлбэрийг бодит API-тай тулгаж шалгасан.
- [ ] Production (ticket 23): `TRUST_PROXY`-г Vercel → Railway hop-ын тоонд тааруулах — буруу бол бүх хэрэглэгч нэг IP-ийн rate limit-д орно.
