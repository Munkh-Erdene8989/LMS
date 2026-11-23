# 39: Кредит ба subscription

**What to build:** DESIGN.md §5 `/credits`. QPay flow-ийн логик хэвээр.

**Blocked by:** 32, 33, 33b

**Status:** done (feat/39-credits-subscription)

## Хийх
- [x] `app/credits/page.tsx`: дээр том үлдэгдэл (display, count-up — reduced-motion-д шууд), багцын 3 карт (нэг нь «Түгээмэл» accent хүрээ), QPay `Dialog` (QR тогтмол хэмжээтэй placeholder, төлөв, `aria-live`), төлбөр батлагдахад toast + CreditPill bump. Гүйлгээний түүх: жагсаалт/хүснэгт, `formatDelta`, `tabular-nums`, баруун тэгшилсэн, `<time>`.
- [x] Credit lot-ийн дуусах хугацаа ойртсон анхааруулга (`--warn`).
- [x] `app/subscription/page.tsx`: 2 plan карт, идэвхтэй plan төлөв, цуцлах → `useConfirm({ danger })` (`window.confirm` устгах).
- [x] `₮` mn.json мессежээс салгаж `formatMnt`.
- [x] CSS: `app/credits/credits.module.css`.

## Шалгах
- typecheck, build.
