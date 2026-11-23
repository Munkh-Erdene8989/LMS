# Web Interface Guidelines audit - apps/web/app

Source: vercel-labs/web-interface-guidelines (command.md, fetched; WebFetch returned a summarized rule list, so rules are applied by category).
Scope: apps/web/app/**/*.tsx (~9.5k lines, 60 files) + globals.css (935 lines). Paths are relative to apps/web/app.
Method: full read of layout/header/otp-flow/purchase-ui/video-player/error pages/globals.css; pattern sweeps (grep) over the remaining files. Cross-cutting findings list representative lines plus a count; they apply to every similar site.

## HIGH (a11y / correctness blockers)

globals.css:1-935 - no `:focus-visible` rule anywhere; `.btn`, `.input`, `.btn-icon`, `.notification`, links rely on UA default; `.input` has no focus ring. Add global focus-visible ring.
globals.css:1-935 - zero `prefers-reduced-motion` handling; the only motion is `transition: top 1.5s, left 1.5s` (globals.css:841, video watermark). New animation system must gate on reduced-motion.
globals.css:13-24 - dark mode via media query only; no `color-scheme: light dark` on `:root`, so native controls (scrollbars, date/file/number inputs, select) stay light in dark mode. No `<meta name="theme-color">`.
courses/purchase-ui.tsx:292-299 - modal: `<div onClick>` backdrop; Escape handled (:256) but NO focus trap, no initial focus, no focus restore, no inert/scroll lock behind. `role="dialog" aria-modal` alone is insufficient.
otp-flow.tsx:143-156 - OTP input: `placeholder="000000"` (looks like a value), inline `letterSpacing: 6`, no `name`, no `enterKeyHint`, no auto-submit on 6th digit; submit disabled until 6 digits with no explanation.
otp-flow.tsx:123-133 - email/phone input: no `name`, no `autoComplete` (`email` / `tel`); `inputMode` duplicates `type`.
otp-flow.tsx:126,146 - `autoFocus` on login inputs (steals focus / opens keyboard on mobile; use sparingly).
otp-flow.tsx:178-180 - countdown `<p>` updates every second without `tabular-nums` (jitter); fine to keep non-live, but needs no-jitter styling.
site-header.tsx:78 - `<nav>` has no `aria-label`, links have no `aria-current="page"`; 8 flat top-level links, no mobile collapse (no header rules in the globals.css:571 breakpoint).
layout.tsx:19-31 - no skip-to-content link; footer links not in a labelled `<nav>`; `<main>` handled per page and inconsistent (`admin/courses/[id]/page.tsx:31`, `page.tsx:15`, `error.tsx:10` bare `<main>`).
(many) - 88 `<input|textarea|select>` without own `id`/`aria-label`; placeholder-as-label pattern: `courses/page.tsx:116-117`, `admin/users/[id]/page.tsx:232-233`, `admin/payments/page.tsx:151`. Need visible labels.
(many) - 103 `<button>` without `type=` (default submit): admin/audit/page.tsx:65, admin/categories/page.tsx:47,50,62,65,106, notifications/page.tsx:62,75, global-error.tsx:21, and more. Inside a `<form>` this submits unexpectedly.
(many) - 19 `window.confirm()` for destructive/money actions: admin/payouts/page.tsx:151, admin/payments/page.tsx:35,111, admin/users/[id]/page.tsx:147,204, subscription/page.tsx:116,141, communities/[teacherId]/page.tsx:383,483, teacher/courses/[id]/page.tsx:580,652, teacher/earnings/payouts.tsx:46, admin/categories/page.tsx:32, admin/community/page.tsx:119, admin/credit-packages/page.tsx:54, admin/legal/page.tsx:75, admin/reviews/page.tsx:94, admin/subscription-plans/page.tsx:55. Unstyled, not themeable, no undo.
globals.css:280-289 - `.btn-icon` is `padding: 2px 8px; font-size: 13px` (~22px tall): touch target far below 44px; used in admin/categories/page.tsx:47-65. `.btn-small` (globals.css:678) likewise.
teacher/analytics/page.tsx:221 - chart bars `<g tabIndex={0} onMouseEnter onFocus>` with no `onMouseLeave`/`onBlur`, no arrow-key navigation, tooltip text (globals.css:895) without `aria-live`.

## MEDIUM

globals.css:30-36 - font stack `system-ui, ..., Roboto`; no Cyrillic-safe webfont (Ө/Ү render differently per OS), no `-webkit-font-smoothing`, no `text-wrap: balance` on headings.
globals.css - no type scale; h1/h2 sizes are UA default or inline (`page.tsx:18`, `purchase-ui.tsx:141` fontSize 24). 45 `<h1>` with inline `margin:0`.
(many) - 100+ inline `style={{...}}` layouts (communities/[teacherId]/page.tsx:104-553, course-ui.tsx:24-128, otp-flow.tsx:100-192). Blocks hover/focus/media states and theming.
globals.css - no `:hover` rule in the whole file; `.btn` (globals.css:64-75) has no hover/active/transition; `.btn:disabled` only `opacity .5`.
globals.css - no `touch-action: manipulation`, no `overscroll-behavior: contain` on `.modal` (globals.css:698), no `env(safe-area-inset-*)`.
globals.css:688-706 - `.modal` uses `100vh` (use `dvh` on mobile).
globals.css:841 - animates layout properties `top/left`; use `transform`.
globals.css:2-10 - token set too small: no `--accent`, `--surface`, `--ring`, radius/shadow/space/motion scale; `--chart-2` same in light and dark (#ea580c) - dark contrast unverified; `.badge` color `#fff` hard-coded (globals.css:120).
globals.css:916 - `text-align: right !important` (`.num`).
(many) - 13 `<table>` / 57 `<th>` without `scope`, no sticky header, no overflow wrapper (admin/audit/page.tsx:30, admin/payouts/page.tsx:106, admin/reports/page.tsx:70).
admin/users/[id]/page.tsx:132 - index keys `key={i}` / `key={j}` on dynamic rows.
(many) - 13 `<img>` without width/height (CLS): admin/course-reviews/page.tsx:24, communities/page.tsx:48, communities/[teacherId]/page.tsx:132,276,406, courses/[id]/page.tsx:73,117, learning/page.tsx:55, credits/page.tsx:315 and subscription/page.tsx:295 (QR). Only courses/catalog-ui.tsx:24 has `loading="lazy"`. Raw `<img>` instead of `next/image`.
(many) - loading is plain `<p>{t('me.loading')}</p>` in 15+ pages (admin/*/page.tsx, notifications/page.tsx:67); no skeletons, no `loading.tsx`, no `aria-busy`. Empty states are one muted line (notifications/page.tsx:68), no CTA.
(many) - transient status ("copied", "saved": teacher/referral/page.tsx:42, purchase-ui.tsx:406) has no `aria-live="polite"`.
courses/catalog-ui.tsx:14 - `rating.average.toFixed(1)`: not locale-aware; use Intl.
notifications/page.tsx:73 - inline `toLocaleString('mn-MN')` while `formatDate` exists in lib/format.ts; inconsistent, no relative time.
lib/format.ts:2-4 - `Intl.NumberFormat` constructed on every call; no currency/credit formatter. `₮` is embedded in message strings (messages/mn.json:340,344,376,427,430) without NBSP; duplicate `const mnt = ...` in admin/payments:11, admin/payouts:10, admin/reports:9; local `credits()` in purchase-ui.tsx:40.
messages/mn.json:299 - straight quotes `"\"{q}\" ..."`; use typographic quotes.
layout.tsx:12-15 - only root metadata; no per-route titles, no `viewport`/`themeColor` export.
page.tsx:15-31 - home page: `<p>` used as flex button row, inline-styled status block, no landing/hero.
global-error.tsx:14-22 - unstyled (inline font, plain button), no dark mode.
video-player.tsx:204 - `accentColor="#2563eb"` hard-coded; no skeleton before MuxPlayer; watermark motion (:146, globals.css:841) ignores reduced-motion.
otp-flow.tsx:183, video-player.tsx:224 - `role="alert"` OK but errors not linked to inputs; `aria-invalid` / `aria-describedby` used nowhere.
communities/[teacherId]/page.tsx:259, courses/[id]/lessons/[lessonId]/assignment-ui.tsx:111 - raw `<input type="file">`: no drop zone, preview, progress or size/type hint.
teacher/courses/[id]/page.tsx, teacher/apply/page.tsx - long editors with no unsaved-changes warning.
admin/community/page.tsx:62-68, otp-flow.tsx:104-120 - `role="tab"` without `tabpanel`/`aria-controls`/arrow-key roving; tab/filter state in `useState`, not URL.

## LOW

globals.css:112-125 - `.badge` font 11px; below comfortable minimum.
globals.css - no `::selection`, no `scroll-padding-top` for a future sticky header.
layout.tsx:10 - `force-dynamic` on the whole app (CSP nonce): no static caching (perf note).
site-header.tsx:51-71 - unread polling every 60s + every window focus + each pathname change; nav pops in after `authed` resolves (layout shift).
course-ui.tsx:53,61,103 - `—` used as empty value with no accessible text.
teacher/apply/page.tsx:191, admin/legal/page.tsx:120 - plain `<a>` for internal links (fine with target=_blank).
admin/** - JSDoc comments in Mongolian; not a UI issue (no hard-coded UI strings found in JSX; i18n pass).
(many) - no `::placeholder` color token; placeholder contrast not controlled.

## PASS (notable)
- aria-label on the bell link, QR alt text, chart `role="img"` + label.
- `rel="noreferrer"` on all 8 `target="_blank"`.
- OTP: `autoComplete="one-time-code"`, `inputMode="numeric"`, `pattern`, `maxLength`, non-digits stripped (paste works).
- `…` in loading strings; all UI copy through `t()`; `Intl.NumberFormat('mn-MN')` for numbers/dates; `html lang` set.
- `tabular-nums` on stat tiles and `.num`; `role="alert"` on errors; `<time dateTime>` in notifications.

## Summary

| Severity | Distinct findings ("many" = pattern across files) |
|---|---|
| HIGH | 15 |
| MEDIUM | 28 |
| LOW | 8 |
| Total | 51 |

Pattern totals (grep): 103 `<button>` without `type`; 19 `window.confirm`; 88 form controls without own id/aria-label; 13 `<img>` without dimensions; 100+ inline `style`; 0 `:focus-visible`; 0 `:hover`; 0 `prefers-reduced-motion`; 0 `color-scheme`; 0 skeleton / `loading.tsx`.
