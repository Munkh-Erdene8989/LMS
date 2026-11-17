# 23: Production бэлтгэл

**What to build:** Платформ staging болон production орчинд ажиллаж, алдаа хянагдаж, QPay бодит орчинд 100₮ test багцаар бүрэн урсгал баталгаажна.

**Blocked by:** 01–22 бүгд

**Status:** code-side done (feat/23-production-readiness) — бодит cloud/түлхүүр шаардсан алхмууд гараар үлдсэн. Алхам бүрийн заавар: [docs/DEPLOY.md](../../../docs/DEPLOY.md)

## Код талд хийгдсэн

- [x] Sentry (web + api): `@sentry/nestjs` + `@sentry/nextjs` 11.10.0 (pin). `SENTRY_DSN` хоосон бол бүрэн унтраастай (init хийгдэхгүй, filter холбогдохгүй). PII scrub (`packages/shared/src/sentry-scrub.ts` + `dataCollection` хатуу): утас, имэйл, token, cookie, header, body. BullMQ ажил сүүлчийн оролдлогоор унавал Sentry-д. Web: `instrumentation*.ts`, `app/error.tsx`, `app/global-error.tsx`. Source map upload зөвхөн `SENTRY_AUTH_TOKEN` тохируулсан үед (upload-ын дараа .map устгана).
- [x] Rate limit (`apps/api/src/rate-limit/`, Redis эсвэл process; fail-open): OTP start/verify, refresh, топап + шалгалт, худалдан авалт, payout хүсэлт, QPay callback (хоёулаа), бусад өөрчлөх хүсэлтэд глобал IP хязгаар. Тестээр баталгаажсан.
- [x] Security header: API `helmet` (CSP `default-src 'none'`, HSTS, `no-referrer`); web `next.config.ts` headers + CSP (Mux, Supabase, QPay лого, GCS upload, Sentry), `poweredByHeader: false`.
- [x] CORS allowlist: `WEB_ORIGIN` + `CORS_ORIGINS` (pattern `*` дэмжинэ). Cookie flag тест (Secure/HttpOnly/SameSite=Lax prod-д).
- [x] `TRUST_PROXY` заавар ба prod-д ≥ 1 шалгалт (Vercel → Railway бол 2 — DEPLOY.md §4).
- [x] Env fail-fast (production): түлхүүрүүд, https/localhost биш `WEB_ORIGIN`/`PUBLIC_WEB_URL`, sandbox `EMAIL_FROM`/`QPAY_BASE_URL` хориг, `RATE_LIMIT_ENABLED` унтраах хориг; web-д Vercel дээр `API_URL` заавал.
- [x] Deploy тохиргоо: `Dockerfile` (apps/api/assets хамт), `.dockerignore`, `railway.json` (pre-deploy `migrate:deploy:prod`, health `/health`, restart policy), `apps/web/vercel.json`. `deploy-config.spec.ts` regression хамгаалалт.
- [x] CI: lint, typecheck, build, fonts/dist шалгалт, test (Postgres 17 + Redis 7 service), concurrency, timeout.
- [x] Cron бүртгэл/дууссаныг BullMQ log-д (`Cron бүртгэв: …`, `Cron ажил "…" дууслаа`) — production log-оос шалгахад.
- [x] Ажиллуулах заавар (Монгол): [docs/DEPLOY.md](../../../docs/DEPLOY.md) + README-аас холбосон.

## Гараар үлдсэн (cloud, түлхүүр, DNS — docs/DEPLOY.md-ийн заасан хэсэг)

- [ ] Staging: Vercel preview + Railway staging + тусдаа Supabase төсөл (DEPLOY.md §5)
- [ ] Production deploy (Railway/Vercel/Supabase/DNS), `TRUST_PROXY`-г бодитоор шалгах (§4, §6)
- [ ] Эхний админ `admin:grant` (§8), `/admin/legal` текст нийтлэх
- [ ] Supabase backup/PITR шалгах, сэргээх дадлага (§9)
- [ ] QPay production: 100₮ тест багцаар цэнэглэлт → худалдан авалт → багшийн орлого → payout (§10.1; payout-д `isTest` орлого орохгүйг анхаар)
- [ ] Mux (upload/webhook/playback), verify.mn OTP, Resend domain баталгаажуулалт бодит түлхүүрээр (§10.2–10.4)
- [ ] Production log-оос cron-уудыг, Sentry event-ийг (PII-гүй, source map-тай) шалгах (§10.5–10.6)
- [ ] Хүсвэл: nonce-д суурилсан CSP (одоо `script-src 'unsafe-inline'`), CSRF-д Origin шалгалт
