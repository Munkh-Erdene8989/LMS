# 34: App shell — header, footer, navigation

**What to build:** DESIGN.md §3 Header + RULES.md #6. Glass sticky header, mobile цэс, кредит pill, footer.

**Blocked by:** 32, 33

**Status:** todo

## Хийх
- [ ] `app/site-header.tsx`: `--header-h` 52px, `--glass` + `backdrop-filter: saturate(180%) blur(20px)`, scroll>8px үед 1px border. Зүүн wordmark «Суралц» (`BRAND.name`), nav (Курсууд, Community, Миний сургалт), баруун `CreditPill` + «Нэвтрэх» эсвэл avatar цэс (Профайл, Кредит, Багш болох / Багшийн самбар, Админ, Гарах).
- [ ] `<nav aria-label>`, `aria-current="page"`, skip-to-content линк (`#main`), бүх хуудасны `<main id="main">` (layout-д wrapper).
- [ ] Mobile (<768): nav → цэс товч (44px) → sheet (Dialog ашиглаж болно), `env(safe-area-inset-*)`.
- [ ] Auth төлөв ачаалах үед баруун хэсэгт Skeleton (pop-in байхгүй). Unread мэдэгдэл polling-ийг auth мэдэгдсэний дараа, focus дээр throttle.
- [ ] Footer: legal линкүүд + брэнд мөр, тайван `--bg-alt`.
- [ ] CSS: `app/site-header.module.css`.

## Шалгах
- typecheck, build. Tab-аар бүх линк хүрнэ, focus ring харагдана, mobile цэс Esc-ээр хаагдана.
