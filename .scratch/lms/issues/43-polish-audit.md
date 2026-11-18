# 43: Polish ба дахин audit

**What to build:** Redesign-ийн төгсгөлийн чанарын хаалга. RULES.md #8, #10.

**Blocked by:** 34–42

**Status:** done except browser QA (feat/43-polish-audit)

## Хийх
- [x] Route бүрт `loading.tsx` (Skeleton), `aria-busy`; «Ачаалж байна…» зөвхөн screen-reader текст.
- [x] Үлдсэн `<img>` → хэмжээтэй / `next/image`, fold-ийн доор `loading="lazy"`.
- [x] Үлдсэн inline `style`, `type`-гүй `<button>`, `toFixed`, hard-code өнгө.
- [x] Grep хаалга: `window.confirm` = 0, `type`-гүй `<button>` = 0, `transition: all` = 0, `outline: none` (ring-гүй) = 0, `#2563eb` = 0.
- [x] `web-design-guidelines` skill-ээр `apps/web/app/**` дахин audit → `.scratch/design/web-guidelines/AUDIT-2.md`; HIGH 0, MEDIUM ≤ 5.
- [ ] Browser QA (coordinator-д үлдсэн — энэ агент хийгээгүй) (integration дээр, `pnpm dev`): 390/768/1024/1440, light/dark, reduced-motion, keyboard-only: нэвтрэх → курс авах → lesson → кредит цэнэглэх. Demo флагтай ба флаггүй.

## Шалгах
- typecheck, build, `pnpm test` ногоон.
