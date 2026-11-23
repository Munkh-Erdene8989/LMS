# Redesign — нэгдсэн шийдвэр (ticket 32–43-ын эх сурвалж)

Integration branch: `feat/redesign` (суурь `origin/main` b00b466). Ticket бүр `feat/NN-*` branch-аар салаалж, энд merge хийгдэнэ.

## Эх баримт
- `frontend-design/DESIGN.md` + `prototype.html` — **суурь систем** (token §2, component §3, motion §4, хуудас §5).
- `taste-skill/index.html`, `landing.css`, `landing.js`, `NOTES.md` — landing бүтэц, кредит тооцоолуур, port зураглал. (`assets/` kit энд хуулагдаагүй — шаардлагагүй, бүгдийг өөрсдөө бичнэ.)
- `web-guidelines/RULES.md` — **заавал дагах checklist**; `AUDIT.md` — одоогийн finding-ууд.

## DESIGN.md-ээс зөрөх шийдвэрүүд (энэ нь давуу)
- Брэнд: **«Суралц»** (`packages/shared/src/brand.ts` `name`).
- Accent: light `--accent:#0071e3`, `--accent-hover:#0077ed`, `--accent-soft:rgba(0,113,227,.1)`; dark `--accent:#2997ff`, `--accent-hover:#47a6ff`, `--accent-soft:rgba(41,151,255,.16)`, `--accent-fg:#fff`.
- Нэмэлт token: `--ring: 0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent)`, `--warn`.
- Font: Inter `next/font/google` (`latin`, `cyrillic`, `cyrillic-ext`), CSS хувьсагч `--font`. Google Fonts `<link>` ХОРИОТОЙ (CSP `font-src 'self'`).
- Landing: sticky lesson stack (DESIGN) **ба** кредит тооцоолуур (taste-skill) хоёулаа.

## Код зохион байгуулалт
- `app/globals.css`: зөвхөн token, reset, primitive класс (`.btn`, `.input`, `.card`, `.badge`, `.chip`, `.page`, `.stack`, typography). Шат 1+ ticket-ууд globals.css-д **хүрэхгүй** (зайлшгүй бол файлын төгсгөлд өөрийн тайлбартай блок).
- Хуудсын тусгай CSS: хажуудаа `*.module.css`.
- Shared UI: `app/ui/*` (ticket 33). Demo өгөгдөл: `lib/demo/*` (ticket 33b).
- Copy: `messages/mn.json`, ticket бүр өөрийн namespace (`landing.*`, `shell.*` …). Хуучин түлхүүрийг устгахгүй бол merge хялбар.
- Inline `style={{…}}` → class. `<button>` бүр `type`. `window.confirm` → `useConfirm()`.
- Хөдөлгөөн: зөвхөн `transform`/`opacity`, `transition: all` хориотой, `prefers-reduced-motion` хүндэтгэнэ.

## Шалгалт (ticket бүр)
`pnpm --filter @lms/web typecheck` ба `pnpm --filter @lms/web build` ногоон. `pnpm dev` ажиллуулахгүй (порт 3000/4000 хуваалцана) — browser QA-г integration дээр хийнэ.
