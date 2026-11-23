# Web Interface Guidelines audit #2 - apps/web/app (ticket 43)

Source: vercel-labs/web-interface-guidelines command.md. WebFetch returned HTTP 503 on two attempts, so the rules were applied by category from RULES.md / AUDIT.md (same method as AUDIT.md). Paths relative to apps/web/app.
Method: grep + script sweeps over all of app/** (buttons incl. multi-line JSX, form controls, img, inline style, CSS selector usage, vh, hard-coded colors, toFixed, key=index, aria-live), targeted reads of the touched files. Browser behaviour (focus order, 390-1440 layouts, reduced motion) is NOT verified here - coordinator browser QA.

## HIGH
None open. All 15 HIGH from AUDIT.md are resolved (focus-visible ring, reduced-motion, color-scheme + theme-color, shared Dialog/useConfirm with focus trap, OTP rewrite, nav aria-label/aria-current, skip link, single `<main id="main">`, visible labels, `type` on every button, 0 window.confirm, 44px targets, chart keyboard/tooltips).
Verified gates: `<button` without type = 0 (script, multi-line aware); window.confirm/prompt = 0; `transition: all` = 0; `outline: none` without ring = 0 (remaining 10 are `:focus-visible` + `--ring` box-shadow, programmatic-focus containers `.main`/dialog, or `.card:has(:focus-visible)` for `.titleLink`); `#2563eb` = 0; own `<main` only in layout.tsx and global-error.tsx.

## MEDIUM (open: 0)
All 3 closed in the follow-up pass below.

## LOW (open: 1, accepted)
layout.tsx:24 - `force-dynamic` on whole app. Accepted: the CSP nonce differs per request (middleware.ts), so a static prerender would ship scripts without a nonce. Revisit only if CSP moves to hashes.

## Follow-up pass (2026-11-23)
- Per-route `<title>`: `lib/page-meta.ts` (`pageMeta(key)` -> «<title> — <brand>») + a server `layout.tsx` per client segment (31: admin/*, teacher/*, communities, credits, learning, login, me, notifications, r, subscription, verify); admin/page.tsx metadata; legal/[slug] generateMetadata. Verified via curl on the dev server.
- File inputs: shared `ui/file-drop.tsx` (drop zone, sr-only focusable input, type/size hint, client type+size check with role=alert, selected name+size+remove, `<progress>` determinate/indeterminate). Used by community composer, assignment form, teacher cover/PDF/video.
- Unsaved guard: `teacher/use-unsaved.ts` now also intercepts in-app link clicks (capture listener -> useConfirm, then router.push); one dialog even when several editors are dirty. Added for cover/PDF/video uploads in progress and the AddLesson draft title. The lesson sub-editor dirty check already covered title/price/preview/markdown/quiz/assignment/live.
- `.num !important` removed: global `.num` deleted, teacher tables use module `s.num` (`.table .num` wins by specificity).
- `—` placeholders -> `ui/empty-value.tsx` (aria-hidden dash + sr-only «Мэдээлэл алга»); global `.sr-only` utility added.
- admin/users/[id] Table rows keyed by entity id (`ids` prop). reports cells keep column-index keys (fixed column order; rows already keyed).
- site-header polling: interval skipped while `document.hidden`; route change / focus / visibilitychange share the 15s throttle.
- ₮: `formatMntDelta` (signed + NBSP ₮) for earningsConfirm and earnings rows; unused `earnings.mnt`, `adminOps.invoiceAmount` deleted. Unit headings «(₮)» kept intentionally.
- Found in browser QA: `formatDate`/`formatRelative` used Intl `mn-MN`, which Chrome's ICU lacks (falls back to en-US) -> server/client text mismatch (hydration error on course reviews) and device-timezone dates. Now locale-independent, Asia/Ulaanbaatar via `isoToUbLocal`. CSP nonce hydration warning suppressed on the two nonce tags. Lesson access pill no longer stretches (`justify-items: start`).

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
| MEDIUM | 28 | 0 | 3 closed in follow-up pass |
| LOW | 8 | 1 | force-dynamic accepted |
| Total | 51 | 1 | |

Pattern totals: `<button>` without type 103 -> 0; window.confirm 19 -> 0; form controls without id/label 88 -> 0 (script); `<img>` without dimensions 13 -> 0; inline `style` 100+ -> 0 non-variable (landing/skeleton only set custom props/size); `:focus-visible` 0 -> global + per-module; `prefers-reduced-motion` 0 -> global + module gates; `color-scheme` 0 -> set; skeleton/loading.tsx 0 -> 12 routes; toFixed in UI 0 (only use-scroll-progress `--p` CSS var).
