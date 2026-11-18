# 43: Polish ба дахин audit

**What to build:** Redesign-ийн төгсгөлийн чанарын хаалга. RULES.md #8, #10.

**Blocked by:** 34–42

**Status:** todo

## Хийх
- [ ] Route бүрт `loading.tsx` (Skeleton), `aria-busy`; «Ачаалж байна…» зөвхөн screen-reader текст.
- [ ] Үлдсэн `<img>` → хэмжээтэй / `next/image`, fold-ийн доор `loading="lazy"`.
- [ ] Үлдсэн inline `style`, `type`-гүй `<button>`, `toFixed`, hard-code өнгө.
- [ ] Grep хаалга: `window.confirm` = 0, `type`-гүй `<button>` = 0, `transition: all` = 0, `outline: none` (ring-гүй) = 0, `#2563eb` = 0.
- [ ] `web-design-guidelines` skill-ээр `apps/web/app/**` дахин audit → `.scratch/design/web-guidelines/AUDIT-2.md`; HIGH 0, MEDIUM ≤ 5.
- [ ] Browser QA (integration дээр, `pnpm dev`): 390/768/1024/1440, light/dark, reduced-motion, keyboard-only: нэвтрэх → курс авах → lesson → кредит цэнэглэх. Demo флагтай ба флаггүй.

## Шалгах
- typecheck, build, `pnpm test` ногоон.
