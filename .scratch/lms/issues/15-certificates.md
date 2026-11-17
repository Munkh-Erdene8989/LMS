# 15: Сертификат

**What to build:** Курсийг бүтнээр эзэмшсэн, бүх lesson-ыг дуусгасан, quiz-ийн дундаж ≥70% хэрэглэгч PDF сертификат (QR кодтой) татна. Хэн ч нийтийн verify хуудсаар кодыг шалгана.

**Blocked by:** 12

**Status:** done

> Шийдвэр: Нөхцөл (`CertificatesService`, `apps/api/src/learning/certificates.service.ts`): (1) курсийг БҮТНЭЭР авсан (`CourseEntitlement`, `ownsFullCourse()`; lesson-уудыг ширхэгээр бүгдийг авсан ч тооцохгүй — SPEC story 55 "own the full course"); (2) курсийн архивлаагүй, APPROVED бүх VIDEO/TEXT/PDF/QUIZ lesson дууссан, ≥ 1 ийм lesson; (3) эдгээр quiz-уудын хамгийн өндөр онооны дундаж `floor` ≥ 70% (`CERTIFICATE_MIN_QUIZ_AVERAGE`), quiz-гүй бол шаардахгүй; (4) profile-д нэртэй (сертификат дээр нэр заавал; үгүй бол 409 `NAME_REQUIRED`). ASSIGNMENT (13), LIVE (дуусгах механизмгүй; бичлэг болгосны дараа VIDEO-оор тооцогдоно) тооцохгүй.
>
> Шийдвэр: Олголт — lesson дуусах / quiz тэнцэх бүрт автоматаар (`issueIfEligible`, явцын хүсэлтийг хэзээ ч унагаахгүй). Нөхцөл өөр замаар биелсэн бол (дараа нь курсийг бүтнээр авсан, нэрээ оруулсан) `POST /learning/courses/:id/certificate` (idempotent: шинэ 201, байгаа 200, нөхцөлгүй 409 `CERTIFICATE_NOT_ELIGIBLE`).
>
> Шийдвэр: `certificates` хүснэгт (user × course unique) — нэр, курс, багшийн нэр, quiz дундаж, lesson-ы тоог олгох мөчийнхөөр snapshot; DB trigger-ээр UPDATE хориотой (profile/курс өөрчлөгдсөн ч PDF, verify ижил). Verify код — 16 тэмдэгт, андуурагдах I/O/0/1-гүй 32 үсэгт цагаан толгой, `crypto.randomInt` (80 бит), unique + CHECK; хэрэглэгчийн оруулсан жижиг үсэг/зураас/зайг хэвийн болгоно, `ABCD-EFGH-…` хэлбэрээр харуулна.
>
> Шийдвэр: PDF (`certificate-pdf.ts`) — `pdfkit` + `qrcode`, хадгалахгүй, хүсэлт бүрт snapshot-оос үүсгэнэ. Монгол кирилл (Ө, Ү) стандарт фонтод байхгүй тул Noto Sans (SIL OFL, `apps/api/assets/fonts`) шигтгэнэ (subset). QR = `PUBLIC_WEB_URL/verify/<code>`. PDF зөвхөн эзэмшигчид (бусад 404).
>
> Шийдвэр: Нийтийн verify (`GET /certificates/verify/:code`, нэвтрэлтгүй) зөвхөн нэр, курс, багш, огноо, код буцаана — user id, имэйл гарахгүй. Мэдэгдэл `CERTIFICATE_ISSUED` (in-app + имэйл) нэг л удаа.

- [x] Нөхцөл шалгалт (бүтэн эзэмшил, бүх lesson, quiz дундаж ≥70%)
- [x] Давтагдашгүй verify код
- [x] PDF: нэр, курс, багш, огноо, QR (verify URL)
- [x] Нийтийн `/verify/<code>` хуудас (+ `/verify` код оруулах форм)
- [x] Мэдэгдэл (`CERTIFICATE_ISSUED`, in-app + имэйл)
- [x] Integration тест (`certificates.spec.ts`, 12 тест): ширхэгээр бүгдийг авсан ч бүтэн эзэмшилгүй бол олгохгүй (дараа бүтэн авахад хүсэлтээр); нэг lesson дуусаагүй (видео 89%) бол олгохгүй, сүүлийнхийг дуусгахад автоматаар + мэдэгдэл нэг удаа; quiz дундаж 66% (тэнцсэн ч) олгохгүй, дахин оролдож 83% → олгоно; тэнцээгүй quiz; нэргүй → `NAME_REQUIRED`; зочин 401, нийтлэгдээгүй 404; архивласан/шалгагдаагүй/ASSIGNMENT/LIVE тооцохгүй; тооцох lesson-гүй курс; verify (нэвтрэлтгүй, хэвийн болгох, 404, хувийн мэдээлэлгүй); PDF (эзэмшигчид л, NotoSans шигтгэсэн, Ө/Ү glyph, QR зураг); өөрчлөгдөхгүй (trigger); код давтагдашгүй

Migration: `20261117850000_certificates` (`certificates` + CHECK-үүд + immutable trigger).

API: `GET /learning/certificates`, `GET /learning/courses/:id/certificate` → `{ certificate, eligibility }`, `POST /learning/courses/:id/certificate`, `GET /learning/certificates/:code/pdf`, `GET /certificates/verify/:code` (нийтийн).

Web: `/learning/[courseId]` — сертификатын карт (нөхцөлийн явц, "Сертификат авах", PDF татах, нийтийн хуудас); `/learning` — "Миний сертификатууд"; `/verify`, `/verify/[code]`. Текст `messages/mn.json` `certificate.*`, PDF/мэдэгдэл `apps/api/src/i18n/mn.json`.

## Үлдсэн

- [x] Ticket 13: ASSIGNMENT нөхцөлд орохгүй (ticket 13-ын шаардлага) — allowlist VIDEO/TEXT/PDF/QUIZ хэвээр.
- [x] `public` (dev) schema-д migration-ийг `pnpm db:deploy`-оор хэрэгжүүлэх.
- [ ] Production build-д `apps/api/assets/` (фонт) хамт deploy хийгдэж буйг шалгах (`dist/../assets`-аас уншина).
