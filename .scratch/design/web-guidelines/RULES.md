# Дахин дизайны заавал дагах дүрэм (Web Interface Guidelines + одоогийн кодын дүгнэлт)

Хэв маяг: minimal, corporate, modern, Apple-like, интерактив animation. Дүрмүүд animation-ыг хязгаарлахгүй, зөв хийхийг шаардана.

## 1. Checklist

### Focus / Keyboard
- [ ] Бүх interactive элемент `:focus-visible` ring-тэй (2px accent + offset, `--ring` token). `outline: none` ганцаараа хориотой.
- [ ] `:focus` биш `:focus-visible`; бүлэг control (search, OTP) дээр `:focus-within`.
- [ ] Modal/Dialog: нээгдэхэд эхний control руу focus, Tab trap, Escape хаах, хаахад trigger руу focus буцаах, арын агуулга `inert`, body scroll lock. Нэг shared `<Dialog>` бүтээж 19 `window.confirm`-ыг орлуулна.
- [ ] `<div onClick>` хориотой: `<button>` / `<Link>` (semantic HTML эхлээд, ARIA дараа).
- [ ] Tabs: `role=tablist` ашиглавал arrow-key roving + `aria-controls`; үгүй бол `aria-pressed` / линк.
- [ ] Skip-to-content линк, `<nav aria-label>`, идэвхтэй линкэнд `aria-current="page"`.
- [ ] Sticky header-тэй бол `scroll-padding-top` (focus халхлагдахгүй).

### Motion / Animation
- [ ] Зөвхөн `transform` + `opacity` animate хийнэ (top/left/width/height биш). `transition: all` хориотой, property-г нэрлэж жагсаана.
- [ ] `@media (prefers-reduced-motion: reduce)`: бүх animation/transition-ыг 0-д ойртуулах эсвэл fade-ээр солих (parallax, auto-play, watermark, shimmer орно).
- [ ] Animation interruptible (CSS transition / spring), давхар дарахад гацахгүй. Хугацаа 150-300ms, easing token (`--dur-fast/base`, `--ease: cubic-bezier(.2,.8,.2,1)`).
- [ ] Hover-ийг `@media (hover:hover)` дотор; touch дээр `:active` feedback.
- [ ] Animation мэдээллийн цорын ганц тээгч байхгүй (төлөв нь текст/icon-оор бас илэрнэ).

### Touch / Layout
- [ ] Touch target >= 44x44px (`.btn-icon` одоо ~22px, засна); ойролцоо control хооронд >= 8px.
- [ ] `touch-action: manipulation`; modal/drawer дээр `overscroll-behavior: contain`.
- [ ] `env(safe-area-inset-*)` header/footer/bottom sheet дээр; `100dvh` (vh биш).
- [ ] Viewport zoom хориглохгүй. Mobile-first; header mobile дээр collapse.
- [ ] Урт текст: `text-wrap: balance` (гарчиг), `min-width:0` + truncate/`line-clamp`; хоосон, 1 тэмдэгт, маш урт нэрийн төлөв загварт орно.

### Forms / OTP
- [ ] Control бүр харагдах `<label>` (placeholder label биш), label дарахад focus.
- [ ] Зөв `type`, `name`, `autoComplete` (`email`, `tel`, `one-time-code`), `inputMode`, `enterKeyHint`. Paste хориглохгүй.
- [ ] OTP: 6 нүдтэй segmented харагдац боловч доор нь нэг input-д суурилсан: `autoComplete="one-time-code"`, `inputMode="numeric"`, paste бүтэн кодыг тараана, backspace өмнөх нүд рүү, 6 дахь цифр дээр авто-submit, `aria-label="Нэг удаагийн код"`, `tabular-nums`. Таймерыг секунд бүр screen-reader-д уншуулахгүй; дуусах/алдаа `role=alert`.
- [ ] Placeholder жишээ хэлбэртэй, `…`-ээр төгсөнө; `000000` биш.
- [ ] Inline алдаа талбарын дэргэд, `aria-invalid` + `aria-describedby`; submit дээр эхний алдаатай талбарт focus.
- [ ] Submit товч зөвхөн request явж байхад disable (spinner + "Илгээж байна…"); validation шалтгаанаар чимээгүй disable хийхгүй.
- [ ] Хадгалаагүй өөрчлөлттэй урт editor-т `beforeunload` / navigation анхааруулга.
- [ ] Бүх `<button>`-д `type` тодорхой (103 дутуу).
- [ ] `autoFocus` зөвхөн нэг зорилготой desktop form-д; mobile дээр байхгүй.

### Loading / Empty / Error
- [ ] Skeleton (shimmer нь reduced-motion-д зогсоно), route бүрт `loading.tsx`, `aria-busy`; "Ачаалж байна…" зөвхөн screen-reader текст.
- [ ] Layout shift байхгүй: зураг `width/height` эсвэл `aspect-ratio`, `next/image`; fold-ийн доорх зураг `loading="lazy"`; QR/cover placeholder ижил хэмжээтэй.
- [ ] Empty state: icon + 1 өгүүлбэр + үндсэн CTA. Error state: юу болсон + яаж засах + retry; идэвхтэй хэлбэр.
- [ ] Async статус (хуулагдлаа, хадгалагдлаа) `aria-live="polite"`; destructive үйлдэлд confirm modal эсвэл undo toast.
- [ ] 50+ мөртэй жагсаалт: virtualize эсвэл pagination; хүснэгтэд `scope`, sticky thead, `overflow-x:auto` wrapper.

### Dark mode / Theme
- [ ] `:root { color-scheme: light dark }` + `<meta name="theme-color">` (light/dark).
- [ ] Бүх өнгө semantic token (`--bg, --surface, --fg, --muted, --border, --accent, --ring, --ok, --warn, --err`); `#fff` / `#2563eb` hard-code хориотой (`.badge`, Mux `accentColor`).
- [ ] Contrast: текст >= 4.5:1, UI/icon >= 3:1 хоёр горимд (`--chart-2` dark дээр шалгах). System default + `data-theme` override.
- [ ] Apple-like: том radius (12-16px), нимгэн border, зөөлөн shadow / `backdrop-filter`; dark дээр shadow-оос илүү border/elevation өнгө.

### Typography / i18n (Монгол кирилл)
- [ ] Font нь Ө, Ү бүрэн дэмжих: variable webfont (Inter `cyrillic` subset, `font-display: swap`) + system fallback.
- [ ] `font-variant-numeric: tabular-nums` бүх үнэ, кредит, таймер, хүснэгтийн тоонд.
- [ ] Зөв тэмдэгт: `…`, хашилт `«…»` / “…”, NBSP (`1 000&nbsp;₮`, `5&nbsp;кредит`).
- [ ] Монгол үг урт: товч 2 мөрт орж болно (fixed width хориотой); `overflow-wrap:anywhere` урт нэр/имэйлд; `lang="mn"` хадгалах.
- [ ] Гарчиг/товч нэг дүрмээр, идэвхтэй тодорхой үйл үг ("Кредит авах", "Хадгалах"); ганц "Үргэлжлүүлэх"-ээс зайлсхий.
- [ ] Бүх copy `messages/mn.json`-оор (одоо дагаж байна); JSX-д hard-code хийхгүй. Тоо/олон тоо: `Intl.PluralRules`.

### Тоо / Мөнгө / Кредит
- [ ] Нэг `formatMnt(n)`, `formatCredits(n)`, `formatDate`, `formatRelative` helper `lib/format.ts` дотор; `Intl.NumberFormat('mn-MN')` инстансийг module-level cache.
- [ ] Үнэ: `1 250 ₮` (NBSP, ₮ тооны ард, 0 орон). Кредит: "12 кредит"; үнэ 0 -> "Үнэгүй".
- [ ] Өөрчлөлт: `+50` / `−20` (жинхэнэ минус), өнгөөс гадна тэмдэг. Дүнгийн багана баруун тэгшилсэн + tabular.
- [ ] Хувь, үнэлгээ `Intl`-ээр (`toFixed` хориотой); огноо `<time dateTime>` + `Intl.DateTimeFormat('mn-MN')`; сүүлийн долоо хоногт relative.
- [ ] Compact тоо (`1.2 сая`) зөвхөн dashboard card; хүснэгтэд бүтэн дүн.

### Performance
- [ ] Layout-ыг inline `style` биш class/token-оор (hover/focus/media боломжтой).
- [ ] `force-dynamic` (CSP nonce) -> боломжтой статик хэсгийг (legal, catalog) кэшлэх; header unread polling-г auth мэдэгдсэний дараа, focus дээр throttle.
- [ ] Том form uncontrolled / `useDeferredValue`; жагсаалт virtualize.
- [ ] Шрифт preload, нэг variable файл; animation номын сан lazy; `will-change` зөвхөн animate хийж байхад.
- [ ] Төлөв URL-д (tab, filter, page, search); ердийн навигаци `<Link>`; render дотор `Date.now()` / `Math.random()` хэрэглэхгүй (hydration).

## 2. Одоогийн кодын хамгийн чухал 10 засвар (эрэмбээр)

| # | Засвар | Үр нөлөө | Хүрэх файлууд |
|---|---|---|---|
| 1 | Глобал `:focus-visible` ring + `:hover/:active` төлөв + `touch-action` | A11y blocker, Apple-like feedback | `app/globals.css` (.btn, .input, .btn-icon, .notification, a) |
| 2 | Design token систем (color/radius/shadow/space/motion), `color-scheme: light dark`, theme-color, hard-code өнгө устгах | Dark mode, нэгдсэн хэв маяг | `app/globals.css`, `app/layout.tsx`, `app/video-player.tsx` (accentColor), `.badge` |
| 3 | `prefers-reduced-motion` + motion token; watermark `top/left` -> `transform` | Motion a11y, perf | `app/globals.css:841`, `app/video-player.tsx` |
| 4 | Нэг shared `<Dialog>` (focus trap/restore/inert/scroll lock) + 19 `window.confirm` солих + undo toast | A11y, UX, брэнд | `app/courses/purchase-ui.tsx`, `app/admin/{categories,community,credit-packages,legal,payments,payouts,reviews,subscription-plans,users/[id]}/page.tsx`, `app/subscription/page.tsx`, `app/communities/[teacherId]/page.tsx`, `app/teacher/courses/[id]/page.tsx`, `app/teacher/earnings/payouts.tsx` |
| 5 | OTP/login дахин бүтээх: segmented OTP, auto-submit, autocomplete/name/enterKeyHint, aria-invalid/describedby, label | Нэвтрэлтийн гол flow | `app/otp-flow.tsx`, `app/login/page.tsx`, `app/globals.css` |
| 6 | Header/nav: aria-label, aria-current, skip link, mobile collapse, sticky blur, auth pop-in skeleton | Navigation, mobile | `app/site-header.tsx`, `app/layout.tsx`, `app/globals.css` |
| 7 | Touch target >= 44px (`.btn-icon`, `.btn-small`, badge) + `<button type>` бүгдэд (103) | Mobile a11y, bug | `app/globals.css:280,678`, `app/admin/categories/page.tsx`, `app/admin/audit/page.tsx`, `app/notifications/page.tsx`, `app/global-error.tsx` + бусад |
| 8 | Loading/empty/error систем: `loading.tsx`, Skeleton, EmptyState, aria-live, зураг хэмжээ / `next/image` | Perceived perf, CLS | `app/**/loading.tsx` (шинэ), `app/courses/catalog-ui.tsx`, `app/learning/page.tsx`, `app/communities/**`, `app/courses/[id]/page.tsx`, `app/credits/page.tsx`, `app/subscription/page.tsx`, `me.loading` ашигладаг бүх хуудас |
| 9 | Нэгдсэн format helper (`formatMnt/formatCredits/formatRating/formatDate`), NBSP, tabular-nums; давхар `mnt` helper устгах; `₮`-г message-ээс салгах | Мөнгө/кредитийн нарийвчлал, i18n | `lib/format.ts`, `messages/mn.json`, `app/admin/{payments,payouts,reports}/page.tsx`, `app/courses/purchase-ui.tsx:40`, `app/courses/catalog-ui.tsx:14`, `app/notifications/page.tsx` |
| 10 | Inline `style` -> class/utility, type scale (h1-h3, balance), Cyrillic-safe font, хүснэгтийн a11y (scope, sticky, overflow wrapper), chart keyboard/tooltip a11y | Дизайн систем, maintain | `app/globals.css`, `app/communities/[teacherId]/page.tsx`, `app/course-ui.tsx`, `app/page.tsx`, `app/admin/*/page.tsx` (table), `app/teacher/analytics/page.tsx:221` |
