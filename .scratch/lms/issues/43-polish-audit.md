# 43: Polish ба дахин audit

**What to build:** Redesign-ийн төгсгөлийн чанарын хаалга. RULES.md #8, #10.

**Blocked by:** 34–42

**Status:** done; manual QA with API+DB pending (feat/43-polish-audit)

## Хийх
- [x] Route бүрт `loading.tsx` (Skeleton), `aria-busy`; «Ачаалж байна…» зөвхөн screen-reader текст.
- [x] Үлдсэн `<img>` → хэмжээтэй / `next/image`, fold-ийн доор `loading="lazy"`.
- [x] Үлдсэн inline `style`, `type`-гүй `<button>`, `toFixed`, hard-code өнгө.
- [x] Grep хаалга: `window.confirm` = 0, `type`-гүй `<button>` = 0, `transition: all` = 0, `outline: none` (ring-гүй) = 0, `#2563eb` = 0.
- [x] `web-design-guidelines` skill-ээр `apps/web/app/**` дахин audit → `.scratch/design/web-guidelines/AUDIT-2.md`; HIGH 0, MEDIUM ≤ 5.
- [x] Browser QA, хэсэгчлэн (2026-11-23, demo флагтай `pnpm dev` + headless Chrome): 390/768/1024/1440, light/dark, reduced-motion; catalog, course, lesson (assignment), learning. Олдсон: Chrome-д `mn-MN` Intl байхгүй тул огнооны hydration зөрөлт, nonce hydration анхааруулга, сунасан access pill. Бүгд засагдсан, console-д алдаа 0. AUDIT-2-ын MEDIUM 3, LOW 5 хаагдсан.
- [ ] Үлдсэн гар QA (API + DB шаардлагатай, headless-д хийх боломжгүй): keyboard-only, нэвтрэх (OTP) → курс авах → кредит цэнэглэх (QPay), teacher editor дээрх FileDrop болон гарахад асуух dialog, demo флаггүй горим.

## Шалгах
- typecheck, build, `pnpm test` ногоон.
