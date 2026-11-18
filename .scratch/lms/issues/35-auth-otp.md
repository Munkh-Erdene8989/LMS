# 35: Нэвтрэлт ба OTP

**What to build:** RULES.md #5, DESIGN.md §3 Form/OTP, §5 Auth. Одоогийн flow-ийн логик (API дуудлага) хэвээр, UI/a11y шинэчилнэ.

**Blocked by:** 32, 33

**Status:** done (feat/35-auth-otp)

## Хийх
- [x] `app/login/page.tsx`: 440px төвлөрсөн карт, том гарчиг, утас/имэйл сонголт (segmented, `aria-pressed`).
- [x] `app/otp-flow.tsx`: харагдах `<label>`, зөв `type`/`name`/`autoComplete` (`tel`, `email`, `one-time-code`), `inputMode`, `enterKeyHint`; placeholder `000000` устгах.
- [x] Segmented OTP: 6 нүд харагдана, доор нь нэг input (`autoComplete="one-time-code"`, `inputMode="numeric"`, `maxLength=6`, `aria-label="Нэг удаагийн код"`), paste бүтэн код, 6 дахь цифрт автоматаар илгээх, focus-д нүд `scale(1.05)`.
- [x] Алдаа: `aria-invalid` + `aria-describedby`, `role=alert`; дахин илгээх countdown (secondsыг screen reader-т уншуулахгүй). `autoFocus` зөвхөн desktop.
- [x] Submit: request явж байхад л disable + «Илгээж байна…».
- [x] CSS: `app/login/login.module.css`.

## Шалгах
- typecheck, build. Утсан дээр SMS код автоматаар бөглөгдөх атрибутууд байна.
