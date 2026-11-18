# 33: Shared UI primitives + format helpers

**What to build:** Бүх хуудас дахин ашиглах client/server компонентууд `apps/web/app/ui/` дотор, мөн нэгдсэн формат helper. DESIGN.md §3, RULES.md §1.

**Blocked by:** 32

**Status:** done (feat/33-ui-primitives)

## Хийх
- [x] `app/ui/button.tsx`: `<Button variant size loading type="button" …>` (`.btn` класс дээр), `<LinkButton>` (`next/link`).
- [x] `app/ui/dialog.tsx`: `<Dialog open onClose title>` — portal, focus trap, нээхэд эхний control, хаахад trigger руу focus буцаана, Esc, scrim click, арын агуулгад `inert`, body scroll lock, `overscroll-behavior: contain`, spring орох (reduced-motion-д fade).
- [x] `app/ui/confirm.tsx`: `<ConfirmProvider>` + `useConfirm()` → `confirm({ title, body, confirmLabel, danger }): Promise<boolean>`. Root layout-д provider. (19 `window.confirm`-ыг солих нь 37/39/40/41/42 ticket-ийн ажил — энд API л.)
- [x] `app/ui/toast.tsx`: `<ToastProvider>` + `useToast()` — доод төв, `role=status aria-live=polite`, ≤3, 3.2s, алдаа `role=alert`.
- [x] `app/ui/skeleton.tsx` (shimmer, reduced-motion-д статик, `aria-hidden`), `app/ui/empty-state.tsx` (icon + өгүүлбэр + CTA).
- [x] `app/ui/reveal.tsx`: `<Reveal>` / `useReveal()` (IntersectionObserver, нэг удаа, JS-гүй үед харагдана). `app/ui/use-scroll-progress.ts` (passive scroll + rAF → элемент дээр `--p` 0..1).
- [x] `app/ui/credit-pill.tsx`: үлдэгдэл, утга өөрчлөгдөхөд bump, `aria-label`, `/credits` линк.
- [x] `app/ui/ui.module.css` эсвэл компонент бүрийн module.css.
- [x] `lib/format.ts` өргөтгөх (`formatNumber`, `formatDate` хэвээр): `formatMnt(n)` → `1 250 ₮` (NBSP), `formatCredits(n)` → `12 кредит` / 0 → «Үнэгүй» биш, үнэд `formatPrice(cr)` → 0 бол «Үнэгүй», `formatDelta(n)` (`+50` / `−20`), `formatRating(n)`, `formatRelative(iso)`. `Intl` инстанс module-level cache.
- [x] `app/admin/{payments,payouts,reports}/page.tsx` доторх давхар `mnt` helper-ийг `formatMnt`-ээр солих.

## Шалгах
- typecheck, build ногоон. Компонент бүрийг одоогоор хаана ч ашиглахгүй байж болно (provider-ууд layout-д залгагдсан байна).
