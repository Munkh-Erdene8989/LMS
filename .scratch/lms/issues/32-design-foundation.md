# 32: Design foundation (token, font, theme, a11y суурь)

**What to build:** `.scratch/design/README.md`-ийн шийдвэрээр Apple-like дизайн системийн суурийг тавина. Бусад бүх redesign ticket үүнээс хамаарна.

**Blocked by:** —

**Status:** todo

## Хийх
- [ ] `apps/web/app/globals.css`: DESIGN.md §2 `:root` token-ууд (accent-ийг README-ийн утгаар), dark (`prefers-color-scheme` + `:root[data-theme="dark"]` бүтэн хуулбар), `color-scheme: light dark`, `--ring`, `--warn`. Хуучин нэрс (`--bg --fg --muted --ok --err --border --chart-*`) хадгална.
- [ ] Reset + typography: `body` `var(--font)`, `--fs-*` scale, `h1–h3` `text-wrap: balance`, `tabular-nums` utility `.num`, `scroll-padding-top: var(--header-h)`.
- [ ] Primitive классуудыг DESIGN.md §3-аар шинэчлэх (нэр хэвээр, хуучин markup эвдрэхгүй): `.btn` (pill 44px, primary/secondary/ghost/danger, `:active scale(.96)` spring), `.btn-small` (≥34px, touch zone 44), `.btn-icon` (44×44), `.input`, `.card`, `.badge` (hard-code өнгө → token), `.page` (max-width `--wrap`).
- [ ] Глобал `:focus-visible { box-shadow: var(--ring) }` (outline-ийг зөвхөн ring-тэй хамт арилгана), hover-ууд `@media (hover:hover)`, `touch-action: manipulation`.
- [ ] `@media (prefers-reduced-motion: reduce)` глобал блок (prototype.html төгсгөлөөс).
- [ ] Watermark animation `top/left` → `transform` (`globals.css` ~841).
- [ ] `apps/web/app/layout.tsx`: Inter `next/font/google` (`variable: '--font-inter'`, `--font`-д холбох), `<meta name="theme-color">` light/dark (`metadata.themeColor` / `viewport`), `data-theme`-ийг localStorage-оос эхэнд тавих жижиг inline script — CSP nonce-ийг `headers()`-оос (`lib/csp.ts`, `middleware.ts`-ийн одоогийн загвараар) авна.
- [ ] `packages/shared/src/brand.ts`: `name: 'Суралц'`.
- [ ] `apps/web/app/video-player.tsx`: hard-code `accentColor` → `#0071e3` тогтмол эсвэл CSS хувьсагчаас уншина.

## Шалгах
- typecheck, build ногоон. Хуучин хуудсууд эвдрэлгүй (класс нэр хэвээр).
- `grep -n "transition: all\|#2563eb" apps/web/app/globals.css` = 0.
