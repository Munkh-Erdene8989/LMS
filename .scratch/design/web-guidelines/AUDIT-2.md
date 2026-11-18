# Web Interface Guidelines audit #2 - apps/web/app (ticket 43)

Source: vercel-labs/web-interface-guidelines command.md. WebFetch returned HTTP 503 on two attempts, so the rules were applied by category from RULES.md / AUDIT.md (same method as AUDIT.md). Paths relative to apps/web/app.
Method: grep + script sweeps over all of app/** (buttons incl. multi-line JSX, form controls, img, inline style, CSS selector usage, vh, hard-coded colors, toFixed, key=index, aria-live), targeted reads of the touched files. Browser behaviour (focus order, 390-1440 layouts, reduced motion) is NOT verified here - coordinator browser QA.

## HIGH
None open. All 15 HIGH from AUDIT.md are resolved (focus-visible ring, reduced-motion, color-scheme + theme-color, shared Dialog/useConfirm with focus trap, OTP rewrite, nav aria-label/aria-current, skip link, single `<main id="main">`, visible labels, `type` on every button, 0 window.confirm, 44px targets, chart keyboard/tooltips).
Verified gates: `<button` without type = 0 (script, multi-line aware); window.confirm/prompt = 0; `transition: all` = 0; `outline: none` without ring = 0 (remaining 10 are `:focus-visible` + `--ring` box-shadow, programmatic-focus containers `.main`/dialog, or `.card:has(:focus-visible)` for `.titleLink`); `#2563eb` = 0; own `<main` only in layout.tsx and global-error.tsx.

## MEDIUM (open: 3)
(many) - client pages have no per-route `<title>`; only layout.tsx:26 + generateMetadata in courses/page.tsx:31, courses/[id]/page.tsx:22, lessons/[lessonId]/page.tsx:20, teachers/[id]/page.tsx:15. admin/teacher/credits/me/etc. share the root title. Needs a server wrapper or `layout.tsx` metadata per segment.
communities/[teacherId]/page.tsx:319, courses/[id]/lessons/[lessonId]/assignment-ui.tsx:133, teacher/courses/[id]/page.tsx:208,754,882 - raw `<input type="file">`: no drop zone / progress / size-type hint (preview exists only for avatar and community image).
teacher/courses/[id]/page.tsx - long editor: unsaved-changes guard (`teacher/use-unsaved.ts`) covers 11 call sites but lesson sub-editors were not re-checked; confirm in browser QA.

## LOW (open: 6)
globals.css:749 - `.num { text-align: right !important }`.
course-ui.tsx:54,62,103, admin/users/[id]/page.tsx:143, admin/audit/page.tsx:95 - `-` placeholder as empty value, no accessible text.
admin/users/[id]/page.tsx:178-180, admin/reports/page.tsx:211 - index keys on static table rows (stable data, no reorder).
layout.tsx:24 - `force-dynamic` on whole app (CSP nonce); no static caching.
site-header.tsx:75 - unread polling interval (throttling not re-audited).
messages/mn.json - `adminOps.earningsConfirm` keeps `{amount}₮` (formatDelta needs the sign); label keys `credits.priceMnt`, `analytics.gross` etc. keep "(₮)" as unit headings; unused keys `earnings.mnt`, `adminOps.invoiceAmount` keep ₮. Not amounts rendered via NumberFormat.

## Fixed in this pass
- verify/page.tsx, verify/[code]/page.tsx, verify/verify-form.tsx: CSS module + `.page-narrow`, no own `<main>`, no inline style, visible `<label>`, `name`, `autoComplete="off"`, `enterKeyHint`, `aria-invalid`/`aria-describedby`, skeleton + aria-busy while loading (new keys certificate.verifyLabel/verifyPlaceholder).
- course-ui.tsx: all inline styles moved to course-ui.module.css (exports/props unchanged). purchase-ui.tsx had none.
- landing/*: only `style` use is CSS custom properties (`--p/--i/--k/--n/--h/--w/--sx`); ui/skeleton.tsx width/height props are the component API.
- loading.tsx (PageLoading + Skeleton, aria-busy, sr-only status text) added to learning, learning/[courseId], courses/[id], credits, subscription, communities, communities/[teacherId], notifications, me, teacher, admin.
- `<img>` without dimensions: admin/courses/[id]/page.tsx:51 (width/height/aspect-ratio), communities/[teacherId]/page.tsx:503 (width/height/aspect-ratio). All 22 `<img>` now sized.
- `₮` removed from 14 message keys (perCredit x2, testBalance, calcValue, attrValue, payout.minimum/request/confirm/blockBELOW_MINIMUM/queueTotal/teacherBalance/paidConfirm, adminOps.earningsSummary/paidAmount, payoutsPaid... ) and call sites use `formatMnt` (NBSP + ₮).
- globals.css: removed 110 selectors with zero references (site-header/footer, bell, notification, badge, catalog-*, course-*, package-card, qpay-*, quiz-*, video-*, stat-*, chart-*, filter-row ...). Kept btn-ghost/btn-danger (built dynamically in ui/button.tsx), s-*, sub-status-*, teacher-box, avatar*, pill*, community-layout. -589 lines.
- Autoprefixer "end value has mixed support" warning: `align-items: end` -> `flex-end` (admin, landing:73, courses:138). Build: 0 warnings.
- Straight quotes `\"..\"` -> `«...»` in 7 mn.json strings (was MEDIUM).
- `100vh` -> `100dvh` (error-page, globals modal, teacher shell) (was MEDIUM).
- Hard-coded `#d97706` (reviews stars) -> `var(--warn)`; `#6e6e73` (credits QR empty) -> `var(--muted)`. Remaining `#fff` (QR backing), `#000` (video) are intentional.

## Before / after

| Severity | AUDIT.md | AUDIT-2.md | Notes |
|---|---|---|---|
| HIGH | 15 | 0 | all resolved |
| MEDIUM | 28 | 3 | target was <= 5 |
| LOW | 8 | 6 | |
| Total | 51 | 9 | |

Pattern totals: `<button>` without type 103 -> 0; window.confirm 19 -> 0; form controls without id/label 88 -> 0 (script); `<img>` without dimensions 13 -> 0; inline `style` 100+ -> 0 non-variable (landing/skeleton only set custom props/size); `:focus-visible` 0 -> global + per-module; `prefers-reduced-motion` 0 -> global + module gates; `color-scheme` 0 -> set; skeleton/loading.tsx 0 -> 12 routes; toFixed in UI 0 (only use-scroll-progress `--p` CSS var).
