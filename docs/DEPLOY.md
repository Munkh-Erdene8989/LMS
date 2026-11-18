# Deploy ба Production заавар

Энэ баримт нь платформыг **staging** болон **production** орчинд гаргах, шалгах алхмуудыг агуулна. Код талын бэлтгэл (Sentry, rate limit, security header, Docker/Railway/Vercel тохиргоо, env шалгалт) хийгдсэн; доорх "гараар хийх" алхмууд нь бодит үйлчилгээний данс, түлхүүр шаарддаг тул хүн хийнэ. Ticket: [.scratch/lms/issues/23-production-readiness.md](../.scratch/lms/issues/23-production-readiness.md).

## 1. Бүтэц

```
Browser ──► Vercel (apps/web, Next.js) ──/api/* rewrite──► Railway (apps/api, NestJS) ──► Supabase Postgres
                 │                                              │   ├─► Railway Redis (BullMQ, rate limit)
                 │                                              │   ├─► Supabase Storage (PDF, зураг)
                 └─► Mux (HLS тоглуулалт, upload)               │   └─► QPay, Mux, verify.mn, Resend (гадны API)
QPay / Mux ── callback / webhook ──────────────────────────────►┘ (API-ийн нийтийн хаяг)
```

- Browser API руу **зөвхөн web-ийн `/api/*` proxy-оор** хандана (auth cookie first-party). Тиймээс API-д `COOKIE_PATH_PREFIX=/api`.
- Web-ийн server render API-г `API_URL`-ээр шууд дууддаг.
- Railway дээр API нэг service: HTTP + BullMQ worker (`WORKERS_ENABLED=true`). Ирээдүйд тусдаа worker service болгохдоо нэгд нь `WORKERS_ENABLED=false`.

## 2. Орчнууд

| | Local | Staging | Production |
|---|---|---|---|
| Web | `pnpm dev` (3000) | Vercel preview/тусдаа "staging" branch deployment | Vercel Production (`main`) |
| API | `pnpm dev` (4000) | Railway `staging` environment | Railway `production` environment |
| DB | Supabase `lms-dev` (+ тестийн `lms_test_NN` schema) | **Тусдаа Supabase төсөл** `lms-staging` | **Тусдаа Supabase төсөл** `lms-prod` |
| Redis | байхгүй (process доторх дараалал, cron ажиллахгүй) | Railway Redis (staging) | Railway Redis (production) |
| QPay | fake (шууд төлөгдсөнд тооцно) | QPay sandbox (`QPAY_BASE_URL=https://merchant-sandbox.qpay.mn`, sandbox түлхүүр) | Бодит merchant (`https://merchant.qpay.mn`) |
| Mux | байхгүй (видео 503) | тусдаа Mux environment | тусдаа Mux environment |
| Sentry | унтраастай | `SENTRY_ENVIRONMENT=staging` | `SENTRY_ENVIRONMENT=production` |
| Имэйл/SMS | fake (код консолд) | Resend + verify.mn (тест түлхүүр боломжтой бол) | Resend (өөрийн domain) + verify.mn |

Дүрэм: **орчин бүр өөрийн DB, Redis, түлхүүртэй**. Staging-ийн түлхүүрийг production-д, эсвэл эсрэгээр хэзээ ч бүү хуваалц. Production DB-д `public` schema (Supabase-ийн анхдагч) ашиглана; тестийг production DB дээр хэзээ ч бүү ажиллуул.

`NODE_ENV=production` үед API асахдаа доорх шалгалтыг хийж, дутвал **ассанаас өмнө унана** (`apps/api/src/env.ts`):

- Шаардлагатай түлхүүрүүд: `VERIFY_MN_API_KEY`, `RESEND_API_KEY`, `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `QPAY_CLIENT_ID`, `QPAY_CLIENT_SECRET`, `QPAY_INVOICE_CODE`, `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE`, `MUX_WEBHOOK_SECRET`.
- `WEB_ORIGIN`, `PUBLIC_WEB_URL`: `https://`, localhost биш.
- `TRUST_PROXY` ≥ 1, `RATE_LIMIT_ENABLED` унтраагүй, `EMAIL_FROM` нь Resend sandbox (`onboarding@resend.dev`) биш, `QPAY_BASE_URL` sandbox биш.

Web талд Vercel build-д `API_URL` байхгүй бол build унана (`apps/web/next.config.ts`).

## 3. Орчны хувьсагчид

### 3.1 API (Railway service variables)

| Хувьсагч | Утга / хаанаас авах | Заавал (prod) |
|---|---|---|
| `NODE_ENV` | `production` (Dockerfile-д тохируулсан) | ✓ |
| `PORT` | Railway өөрөө өгнө | — |
| `DATABASE_URL` | Supabase → Project → Connect → **Transaction pooler** (port 6543) + `?pgbouncer=true` | ✓ |
| `DIRECT_URL` | Supabase → Connect → **Session pooler** (port 5432). Зөвхөн migration (pre-deploy) ашиглана | ✓ |
| `JWT_SECRET` | ≥ 32 тэмдэгт санамсаргүй: `openssl rand -base64 48`. Орчин бүрт өөр. Соливол бүх нэвтрэлт хүчингүй болно | ✓ |
| `WEB_ORIGIN` | Web-ийн нийтийн хаяг, жишээ `https://lms.example.mn` (CORS + cookie) | ✓ |
| `PUBLIC_WEB_URL` | Имэйл дэх линкийн суурь; ихэвчлэн `WEB_ORIGIN`-тай ижил | ✓ |
| `CORS_ORIGINS` | `WEB_ORIGIN`-оос гадна зөвшөөрөх origin (таслалаар; CORS + CSRF Origin шалгалт хоёуланд). Staging preview: `https://lms-git-*-<team>.vercel.app`. Хоосон байж болно | — |
| `COOKIE_PATH_PREFIX` | `/api` (web proxy-оор дууддаг тул) | ✓ |
| `TRUST_PROXY` | Proxy hop-ын тоо — [4. TRUST_PROXY](#4-trust_proxy) | ✓ |
| `RATE_LIMIT_ENABLED` | Үлдээ (анхдагч `true`). Prod-д `false` болгож болохгүй | — |
| `REDIS_URL` | Railway → Add Redis → `${{Redis.REDIS_URL}}` (private network). BullMQ + rate limit | ✓ |
| `WORKERS_ENABLED` | `true` (нэг service) | — |
| `VERIFY_MN_API_KEY` | verify.mn-ээс (утасны OTP) | ✓ |
| `RESEND_API_KEY` | resend.com → API Keys (Sending access) | ✓ |
| `EMAIL_FROM` | `LMS <noreply@your-domain.mn>` — Resend-д **баталгаажсан domain** (SPF/DKIM) | ✓ |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` (нууц! зөвхөн API) | ✓ |
| `QPAY_CLIENT_ID`, `QPAY_CLIENT_SECRET`, `QPAY_INVOICE_CODE` | QPay merchant гэрээнээс | ✓ |
| `QPAY_BASE_URL` | Анхдагч `https://merchant.qpay.mn`; staging: sandbox | — |
| `QPAY_CALLBACK_BASE_URL` | **API-ийн нийтийн хаяг** (жишээ `https://api.example.mn`). Хоосон бол `PUBLIC_WEB_URL/api` (Vercel proxy-оор). Шууд API руу чиглүүлэхийг зөвлөнө | — |
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` | Mux → Settings → Access Tokens (Video: read+write) | ✓ |
| `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE` | Mux → Settings → Signing Keys (private key base64) | ✓ |
| `MUX_WEBHOOK_SECRET` | Mux → Settings → Webhooks (доорх URL-д тохируулсны дараа харагдана) | ✓ |
| `MUX_DATA_ENV_KEY` | Mux Data environment key (заавал биш) | — |
| `SENTRY_DSN` | Sentry → API төслийн DSN. Хоосон бол Sentry унтраастай | санал болгоно |
| `SENTRY_ENVIRONMENT` | `staging` / `production` | — |
| `SENTRY_RELEASE` | Хоосон бол `RAILWAY_GIT_COMMIT_SHA` | — |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` анхдагч (0–1) | — |

### 3.2 Web (Vercel Project → Settings → Environment Variables)

| Хувьсагч | Утга | Хэзээ |
|---|---|---|
| `API_URL` | API-ийн нийтийн хаяг (`https://api.example.mn`). **Build-д шингэдэг** — солисны дараа redeploy | Build + Runtime, заавал |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry → Web төслийн DSN (browser-т ил байх ёстой тул `NEXT_PUBLIC_`). Хоосон бол унтраастай | Build |
| `SENTRY_DSN` | Server талын DSN (хоосон бол `NEXT_PUBLIC_SENTRY_DSN`-г ашиглана) | Runtime |
| `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Хоосон бол `VERCEL_ENV` | — |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens (`project:releases`, `org:read`). **Зөвхөн Build** орчинд, "Sensitive". Тохируулбал source map upload асна; үгүй бол upload хийгдэхгүй | Build |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry-ийн org/project slug | Build |

Vercel тохиргоо: Root Directory = `apps/web`, "Include source files outside of the Root Directory" = Enabled. Install/build команд `apps/web/vercel.json`-д (`pnpm --filter "@lms/web..." run build` — `@lms/shared`-ийг хамт build хийнэ). Node 22.

## 4. TRUST_PROXY

Rate limit хэрэглэгчийн IP-ээр тоолдог тул API-ийн өмнө хэдэн proxy байгааг зөв заах ёстой (`X-Forwarded-For`-ийн баруунаас хэдэн хаягийг итгэх вэ).

| Замнал | `TRUST_PROXY` |
|---|---|
| Browser → **Vercel `/api` rewrite** → Railway edge → API | **2** (Railway edge + Vercel) |
| Browser/curl → Railway edge → API (шууд, жишээ QPay/Mux webhook) | 1 |

Web proxy-оор ирдэг browser хүсэлт ихэнх тул prod-д **2** тавихыг зөвлөнө; webhook-ууд IP-ээр хязгаарлагддаг тул энэ нь асуудал үүсгэхгүй. Буруу тохиргооны үр дагавар:
- Хэт бага (0/1 байх ёстойд): бүх хэрэглэгч нэг (Vercel-ийн) IP-д тоологдож, нэг хэрэглэгчийн олон оролдлого бусдыг блоклоно.
- Хэт их: халдагч `X-Forwarded-For`-д хуурамч хаяг нэмж rate limit-ээс мултарна.

**Шалгах арга** (deploy хийсний дараа): өөрийн утас/имэйлээр `/login` дээр нэг OTP эхлүүлж, DB-д `select ip, created_at from otp_challenges order by created_at desc limit 3;` ажиллуул. `ip` нь **таны** нийтийн IP (whatismyip) байх ёстой — Vercel/Railway-ийн хаяг эсвэл хоосон бол `TRUST_PROXY`-г өөрчил.

## 5. Staging тохируулах

1. **Supabase**: шинэ төсөл `lms-staging` (production-той ижил region). Connect → pooler string-үүдийг ав. Storage bucket-уудыг (`lms-public`, `lms-private`) API асахдаа өөрөө үүсгэнэ.
2. **Railway**: төсөл дотор `staging` environment (production-ыг хуулж болно). Service → GitHub repo холбох, **Root Directory хоосон (repo root)**, Config as code = `railway.json`. `Redis` нэмж `REDIS_URL`-г reference-ээр холбо. Variables: дээрх 3.1 хүснэгт (staging түлхүүрүүдээр; `QPAY_BASE_URL` sandbox; `SENTRY_ENVIRONMENT=staging`). Service-д public domain үүсгэ (`lms-api-staging.up.railway.app`).
3. **Vercel**: нэг Vercel project. Preview deployment бүр `API_URL`-ийн **Preview** утгыг (staging API) ашиглана; Production утга нь prod API. `main`-ээс бусад branch/PR → preview. Тогтмол staging хаяг хэрэгтэй бол `staging` branch-ийг Settings → Domains дээр `staging.example.mn`-д холбо.
4. Staging API-д `WEB_ORIGIN` / `PUBLIC_WEB_URL` = staging web хаяг. Preview URL-ууд (`https://lms-git-*-<team>.vercel.app`) өөр болох тул `/api` proxy-оор дуудах үед CORS хамаарахгүй ч браузерын `Origin` (preview URL) нь API-ийн CSRF шалгалтад орно, тиймээс preview домэйн `CORS_ORIGINS`-д (`https://lms-git-*-<team>.vercel.app`) байх ёстой; харин `PUBLIC_WEB_URL` (имэйл линк, QPay callback) нь тогтмол staging домэйн байх ёстой.
5. Migration автоматаар (pre-deploy) ажиллана. Эхний админийг [8](#8-эхний-админ)-ийн дагуу үүсгэ.
6. Доорх [10](#10-гараар-шалгах-checklist)-ийг staging дээр (QPay sandbox-оор) эхлээд гүйцэтгэ, дараа нь production.

## 6. Production deploy

1. Supabase `lms-prod` төсөл (мөн [9. Backup](#9-supabase-backup-ба-pitr)-ийг шалга) → Railway `production` environment → Vercel Production.
2. Домэйн: Vercel-д `lms.example.mn`, Railway-д `api.example.mn` (CNAME-г DNS-д гараар). `WEB_ORIGIN`, `PUBLIC_WEB_URL`, `API_URL`, `QPAY_CALLBACK_BASE_URL`-ийг эдгээрт тааруул.
3. Railway: variables бүгдийг тавиад deploy. Дараалал: **build** (Dockerfile) → **pre-deploy** `pnpm --filter @lms/db migrate:deploy:prod` (амжилтгүй бол шинэ хувилбар гарахгүй, хуучин ажилласаар) → **start** `node dist/main.js` → **health check** `GET /health` (60 сек). Env шалгалт унавал deploy log-д `Орчны хувьсагч буруу:` + дутсан түлхүүрүүд гарна.
4. Гадны callback-уудыг тохируул:
   - **QPay**: нэхэмжлэх бүрт callback URL-г API өөрөө өгдөг (`QPAY_CALLBACK_BASE_URL/payments/qpay/callback/<token>`) — QPay талд тусдаа тохиргоо хэрэггүй, гэхдээ тэр хаяг интернетээс хүрдэг эсэхийг шалга (`curl -i https://api.example.mn/payments/qpay/callback/x` → 404 `NOT_FOUND` буцна).
   - **Mux**: Settings → Webhooks → `https://api.example.mn/webhooks/mux` → гарсан signing secret-ийг `MUX_WEBHOOK_SECRET`-д.
   - **Resend**: domain баталгаажуулж `EMAIL_FROM` солих ([10.4](#104-resend-domain)).
5. Үйлчилгээний нөхцөл, нууцлал, багшийн гэрээний текстийг `/admin/legal`-д нийтэл (ticket 04) — багшийн гэрээ нийтлэгдээгүй бол багшийн өргөдөл гаргах боломжгүй.

### Файл (apps/api/assets)

Сертификатын PDF фонт (`apps/api/assets/fonts/NotoSans-*.ttf`) нь код `dist/../assets` замаас уншдаг. `Dockerfile` repo бүхлийг (`COPY . .`) хуулдаг, `.dockerignore` `assets`-ийг хасдаггүй, `apps/api/test/deploy-config.spec.ts` үүнийг шалгана. CI мөн `apps/api/assets/fonts/OFL.txt`-ийг build-ийн дараа шалгана. Deploy-н дараа шалгах: сертификат үүсгэж PDF татаад монгол үсэг (Ө, Ү) зөв харагдаж байна уу.

## 7. Migration урсгал

1. Schema өөрчлөх: локал `pnpm db:migrate` (dev DB) → `packages/db/prisma/migrations/<timestamp>_<name>/` PR-д орно.
2. PR → CI (lint, typecheck, build, test — Postgres + Redis service-тэй).
3. `main`-д merge → Railway автоматаар deploy → **pre-deploy-д `prisma migrate deploy`** ажиллаж хүлээгдэж буй migration-уудыг хэрэгжүүлнэ. Амжилтгүй бол deploy зогсоно (хуучин хувилбар ажиллана).
4. Staging-д эхлээд: staging environment-ийн `main`-ийн өмнөх branch-аар deploy хийж migration-ийг туршиж, дараа нь production.
5. **Dev/prod `public` schema руу гараар `pnpm db:deploy` хийхгүй** — зөвхөн dev DB-д (`.env`-ийн `lms-dev`) хийнэ. Production-ийн DB рүү зөвхөн Railway pre-deploy хүрнэ.
6. Эвдэх migration (багана устгах/нэр солих): 2 алхамтай хий — эхлээд код хоёр хувилбарт тохирох болгож deploy, дараа нь устгах migration. Production migration-ийн өмнө Supabase backup/PITR идэвхтэй эсэхийг шалга.
7. Буцаах: Prisma `down` migration байхгүй. Алдаатай migration-ийг засах шинэ migration бич; ноцтой бол Supabase PITR-ээр сэргээ (дараах хэсэг).
8. **Шинэ хүснэгт бүр migration-даа `ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;` агуулах ёстой.** Supabase `public`-ийг PostgREST-ээр anon/authenticated-д нээдэг (advisor `rls_disabled_in_public`). Апп PostgREST ашигладаггүй: API Prisma-аар `postgres` (эзэмшигч, RLS тойрно)-оор холбогдоно, тиймээс policy-гүй deny-all хангалттай; FORCE RLS хэрэглэхгүй. `apps/api/test/rls.spec.ts` RLS-гүй хүснэгтийг барина. Мөн FK багана шинээр нэмбэл хайлт/устгалд ашиглагддаг бол `@@index` тавь. Trigger функц бичихдээ `ALTER FUNCTION ... SET search_path FROM CURRENT` (`public`-ыг хатуу бичихгүй: тест schema-д эвдэнэ).

## 8. Эхний админ

1. Өөрийн утас/имэйлээр production web дээр `/login`-оор нэг удаа нэвтэр (хэрэглэгч үүснэ).
2. Railway → API service → shell (`railway ssh`, эсвэл dashboard-ийн Shell) дээр:
   ```bash
   node dist/cli/grant-admin.js <утас|имэйл>
   ```
3. Дахин нэвтэрч `/admin` нээгдэж байгааг шалга. Админ нэмэхэд мөн адил.

## 9. Supabase backup ба PITR

Production төсөл дээр **суурь тохиргоог гараар шалга** (Supabase Dashboard → Project → Database → Backups):

- [ ] Төлөвлөгөө (plan) **Pro** эсвэл түүнээс дээш — үнэгүй (Free) төлөвлөгөөнд автомат backup гарган авах боломж хязгаарлагдмал.
- [ ] **Daily backups** идэвхтэй, хадгалах хугацаа тань хангалттай (Pro: 7 хоног).
- [ ] **Point-in-Time Recovery (PITR) add-on** идэвхжүүлсэн (санхүүгийн өгөгдөл — кредит, төлбөр, payout — тул санал болгож байна). PITR нь Small compute-аас дээш шаарддаг.
- [ ] **Сэргээх дадлага**: staging төсөл рүү (эсвэл Dashboard → Restore to new project) нэг удаа сэргээж, `payments`, `credit_ledger_entries`, `teacher_earning_entries`-ийн мөрийн тоо таарч буйг шалга. Хэр хугацаа орсныг тэмдэглэ (RTO).
- [ ] **Storage файлууд** (`lms-public`, `lms-private` bucket) нь DB backup-д **орохгүй** (зөвхөн metadata). Сертификат, assignment файлыг дахин үүсгэх боломжтой эсэхийг шийд; чухал бол тусдаа хуулбарлах (жишээ нь сар бүр bucket sync).
- [ ] Хандалт: Supabase төслийн гишүүд (хамгийн цөөн), 2FA идэвхтэй, `service_role` түлхүүр зөвхөн Railway-д.
- [ ] Redis (BullMQ) өгөгдөл түр зуурын: алдагдвал cron `schedule`-ууд API дахин асахад (upsert) сэргэнэ; хүлээгдэж буй имэйл/live сануулга алдагдаж болно.

## 10. Гараар шалгах checklist

Staging (QPay sandbox) дээр эхлээд, дараа нь production-д бодит түлхүүрээр. Эхлэхийн өмнө `/health` → `{ "status": "ok", "db": "ok" }`.

### 10.1 QPay: 100₮ тест багцаар цэнэглэлт → худалдан авалт → багшийн орлого → payout

> `isTest` багцаар олгосон кредит, түүгээр хийсэн худалдан авалт, багшийн орлого нь `isTest` тэмдэгтэй: админы тайланд тусдаа, **payout-ийн үлдэгдэлд орохгүй**. Иймээс payout-ийг дуустал шалгахад 4-р алхмын тусгай бэлтгэл хэрэгтэй.

1. **Цэнэглэлт** — Админ `/admin/credit-packages`: багц үүсгэ (нэр "100₮ тест", кредит 10, үнэ **100₮**, "Тест" тэмдэг идэвхтэй, идэвхтэй). Админ эрхээр `/credits` → багц сонгох → QPay апп-аар 100₮ төл.
   - [ ] QR, банкны deeplink-ууд харагдаж, лого зураг CSP-д блоклогдоогүй (DevTools Console-д CSP алдаа үгүй).
   - [ ] Callback (`/payments/qpay/callback/...`) ирж, эсвэл "Төлбөр шалгах" дарахад төлөв `PAID`, баланс +10 кредит. Railway log-д `QPay` алдаа үгүй; `/admin/payments`-д `AMOUNT_MISMATCH` эсвэл хуучирсан `PENDING` үгүй.
2. **Худалдан авалт** — Өөр (багшийн) хэрэглэгчийн PUBLISHED курсийн нэг хичээлийг тест кредитээр худалдаж ав.
   - [ ] `/learning` дээр эзэмшил, имэйл баримт (Resend) ирсэн.
3. **Багшийн орлого** — Багшийн `/teacher/earnings`-д борлуулалтын бичилт харагдана: дүн = `floor(кредит × creditPriceMnt × (100 − шимтгэл%) / 100)`, `isTest` тэмдэгтэй. Админ тайланд тест тусдаа.
4. **Payout (бодит дүнтэй)** — Түр бэлтгэл: админ `Тохиргоо`-д `payoutMinimumMnt`-ийг түр `1` болго; `isTest`-гүй 100₮ үнэтэй, 1 кредиттэй идэвхтэй багц үүсгэ; өөр хэрэглэгчээр бодит 100₮ төлж 1 кредит ав → тэр кредитээр багшийн хичээл худалдаж ав (багшид `floor(1 × creditPriceMnt × (100 − шимтгэл%)/100)`₮ орно).
   - [ ] Багш `/teacher/payouts` → "Хүсэлт гаргах" → админ `/admin/payouts`-д харагдана → CSV export → "Төлсөн" тэмдэглэх → багшид мэдэгдэл/имэйл ирнэ, үлдэгдэл 0.
   - [ ] **Дараа нь буцаа**: `payoutMinimumMnt`-ийг 50 000 болго, түр багцыг идэвхгүй болго.

### 10.2 Mux: upload → webhook → тоглуулалт

- [ ] Багш хичээлд видео upload хийнэ (browser Mux/GCS руу шууд `PUT` — CSP `connect-src` блоклоогүй).
- [ ] Mux Dashboard → Webhooks → хүргэлт `200` (`/webhooks/mux`); хичээлийн төлөв `READY` болно (гарын үсэг буруу бол 4xx — `MUX_WEBHOOK_SECRET` шалга).
- [ ] Эзэмшсэн суралцагч тоглуулна: signed playback ажиллана, watermark (`9911****`) харагдана, 3 дахь төхөөрөмж блоклогдоно, Mux Data-д view бичигдсэн (боломжтой бол).
- [ ] Эзэмшээгүй хэрэглэгчид тоглуулах token өгөхгүй (403).

### 10.3 verify.mn (утасны OTP)

- [ ] `/login` → Утас → код авч өөрийн утаснаас `144773` руу SMS илгээнэ → нэвтэрнэ. Хоёр дахь удаа хурдан дарахад 429 (rate limit) ба монгол мессеж.
- [ ] Хаагдсан хэрэглэгч нэвтэрч чадахгүй (ticket 22).

### 10.4 Resend domain

- [ ] resend.com/domains → domain нэмж DNS (SPF, DKIM, DMARC) бичлэгүүдийг тохируул → "Verified".
- [ ] `EMAIL_FROM`-ийг тэр domain-ий хаяг болго (`onboarding@resend.dev` бол API асахгүй).
- [ ] Имэйлээр нэвтрэх код ирнэ; spam биш; худалдан авалтын баримт ирнэ. Resend → Emails-д `delivered`.

### 10.5 Cron ба арын ажил (Railway → API → Logs)

API асахад `Cron бүртгэв: <нэр> "<cron>" (Asia/Ulaanbaatar)` мөрүүд гарна. Дөрвөн cron:

| Cron | Хуваарь (УБ цаг) | Лог |
|---|---|---|
| `maintenance.cleanup` | 03:30 өдөр бүр | `Цэвэрлэгээ: OTP …, session …` |
| `credits.expiry` | 00:10 өдөр бүр | `Кредит дуусгавар: …` |
| `subscriptions.renew` | 09:00 өдөр бүр | `Сунгалт: …` (хийх зүйл байвал) |
| `mux.orphan-cleanup` | цаг бүр :20 | `Mux orphan цэвэрлэгээ: …` (хийх зүйл байвал) |

- [ ] Эхний ажиллах хуваарийн дараа `Cron ажил "<нэр>" дууслаа` мөр гарсан.
- [ ] `live.reminder` (delayed): live хичээл товлож, эхлэхээс өмнөх сануулга цагтаа ирсэн (log + мэдэгдэл) — ticket 14.
- [ ] Redis холбогдсон: log-д `Redis алдаа` үгүй; `Ажил "…" амжилтгүй` давтагдахгүй.

### 10.6 Sentry

- [ ] **API**: Railway shell-д `node -e "const S=require('@sentry/nestjs');S.init({dsn:process.env.SENTRY_DSN,environment:'smoke'});S.captureException(new Error('sentry api test'));S.flush(3000).then(()=>process.exit())"` → Sentry Issues-д гарна.
- [ ] **Web**: production сайтын browser console-д `setTimeout(()=>{throw new Error('sentry web test')})` → Issues-д гарч, stack trace **эх кодын** (source map) мөртэй харагдана (`SENTRY_AUTH_TOKEN` тохируулсан үед).
- [ ] Event-д утас, имэйл, cookie, token **байхгүй** (Issue → Request/User/Breadcrumbs тал хараарай; зөвхөн хэрэглэгчийн `id`).
- [ ] Alert дүрэм: шинэ issue, 5xx өсөлт → имэйл/Slack.

### 10.7 Аюулгүй байдлын хурдан шалгалт

- [ ] `curl -I https://api.example.mn/health` → `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`; `X-Powered-By` үгүй.
- [ ] `curl -I https://lms.example.mn/login` → CSP, `X-Frame-Options: DENY`, `Permissions-Policy`.
- [ ] Cookie (DevTools → Application): `access_token`, `refresh_token` нь `HttpOnly`, `Secure`, `SameSite=Lax`; `refresh_token` Path=`/api/auth`.
- [ ] `curl -s -H "Origin: https://evil.example" -I https://api.example.mn/health` → `Access-Control-Allow-Origin` **байхгүй**.
- [ ] OTP-г нэг IP-ээс минутад 11 удаа эхлүүлэхэд 11-р нь 429 (+`Retry-After`) — `TRUST_PROXY`-г [4](#4-trust_proxy)-ийн дагуу шалгасны дараа.

## 11. Аюулгүй байдлын тохиргоо (кодод хэрэгжсэн)

| Хамгаалалт | Хаана | Тайлбар |
|---|---|---|
| Rate limit | `apps/api/src/rate-limit/` | `REDIS_URL` байвал Redis-д (олон instance), үгүй бол process-д. Redis унавал хүсэлт хаахгүй (fail-open). Хязгаар хэтэрвэл `429 RATE_LIMITED` + `Retry-After` |
| — OTP эхлүүлэх | `POST /auth/otp/start` | IP тутамд 10/мин (+ DB: identifier 3/10мин, IP 20/цаг) |
| — OTP шалгах | `POST /auth/otp/verify` | IP тутамд 20/10мин (+ нэг challenge-д 5 оролдлого) |
| — Token шинэчлэх | `POST /auth/refresh` | IP тутамд 60/мин |
| — Топап | `POST /credits/topups` | Хэрэглэгч тутамд 10/мин; `…/check` 30/мин |
| — Худалдан авалт | `POST /purchases/{lessons,courses}/:id` | Хэрэглэгч тутамд 20/мин |
| — Payout | `POST /teacher/payouts` | Хэрэглэгч тутамд 5/мин |
| — QPay callback | `…/callback/:token` | IP тутамд 120/мин |
| — Бусад POST/PUT/PATCH/DELETE | глобал | IP тутамд 300/мин (GET хамаарахгүй — web-ийн SSR нэг IP-ээс олон хэрэглэгчийн GET хийдэг). Mux webhook чөлөөлөгдсөн (гарын үсэгтэй) |
| — Quiz | ticket 12 | 30 сек cooldown + 24 цагт 10 |
| API security header | `helmet` (`configure-app.ts`) | CSP `default-src 'none'`, HSTS 1 жил, `no-referrer`, `nosniff`, frame хориг |
| Web security header | `apps/web/next.config.ts` | `nosniff`, `X-Frame-Options`, HSTS, `Referrer-Policy`, `Permissions-Policy` |
| Web CSP (nonce) | `apps/web/middleware.ts`, `apps/web/lib/csp.ts` | Хүсэлт бүрт шинэ nonce: `script-src 'self' 'nonce-…' 'strict-dynamic'` (`'unsafe-inline'` script-д алга). Mux (`*.mux.com`, `*.litix.io`, GCS upload), Supabase, QPay лого, Sentry-д зориулсан allowlist; `frame-ancestors 'none'`, `object-src 'none'` |
| CSRF (Origin шалгалт) | `apps/api/src/csrf.ts` | POST/PUT/PATCH/DELETE-ийн `Origin` (эсвэл `Referer`) нь `WEB_ORIGIN` + `PUBLIC_WEB_URL` + `CORS_ORIGINS`-д байх ёстой, үгүй бол 403 `CSRF_ORIGIN`. Чөлөөлөлт: `/webhooks/*` (Mux), `/payments/qpay/*` (QPay callback) |
| CORS | `WEB_ORIGIN` + `CORS_ORIGINS` allowlist | Бусад origin-д `Access-Control-Allow-Origin` өгөхгүй |
| Cookie | `auth/cookies.ts`, `referrals/cookie.ts` | `HttpOnly`, `SameSite=Lax`, `Secure` (production), refresh cookie зөвхөн `…/auth` path |
| Sentry PII | `packages/shared/src/sentry-scrub.ts` | Cookie, header, body, query, утас, имэйл, token арилгана; хэрэглэгчээс зөвхөн `id` |

Мэдэгдэж буй хязгаарлалт / дараагийн алхам:
- CSP: `script-src` nonce + `'strict-dynamic'`. Trade-off: nonce хүсэлт бүр өөр тул бүх хуудас dynamic render (статик prerender/CDN cache алга; `app/layout.tsx`-д `force-dynamic`). `style-src` нь `'unsafe-inline'` хэвээр (React `style=`, Mux player). Staging/prod-д бодит browser дээр console-д CSP violation байгаагүй эсэхийг (Mux player, QPay, upload) шалгана.
- Rate limit-ийн Redis хэрэгжилт нь фиксэд цонх (fixed window). Хэрэв IP хоорондын CGNAT (Монголын ISP) асуудал үүсвэл `LIMITS`-ийг (`rate-limit.ts`) тохируул.
- CSRF: `SameSite=Lax` дээр нэмж API-д Origin/Referer шалгалт. Origin ба Referer хоёулаа байхгүй үед: auth cookie (`access_token`/`refresh_token`) БАЙХГҮЙ бол зөвшөөрнө (curl, server-to-server; cookie-гүй хүсэлт хохирогчийн эрхийг ашиглаж чадахгүй), cookie БАЙВАЛ 403 (хөтөч POST дээр Origin-ийг үргэлж илгээдэг). `Origin: null` татгалзана. Шинэ server-to-server callback нэмбэл `csrf.ts`-ийн `EXEMPT_PREFIXES`-д оруулна.

## 12. Хэрэгтэй команд

```bash
pnpm lint && pnpm typecheck && pnpm build   # CI-тэй ижил (локалд)
pnpm test                                   # DATABASE_URL_TEST (lms_test_NN schema), jest --runInBand
```

Railway CLI: `railway link`, `railway logs`, `railway ssh`. Vercel: `vercel env ls`. Production DB руу локалаас холбогдох / migrate хийх ЗОРИУЛАЛТГҮЙ — Railway pre-deploy ашигла.
