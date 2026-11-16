# 23: Production бэлтгэл

**What to build:** Платформ staging болон production орчинд ажиллаж, алдаа хянагдаж, QPay бодит орчинд 100₮ test багцаар бүрэн урсгал баталгаажна.

**Blocked by:** 01–22 бүгд

**Status:** ready-for-agent

- [ ] Sentry (web + api), source map
- [ ] Rate limit, security header, CORS, cookie тохиргоо шалгах
- [ ] Staging: Vercel/Railway preview + тусдаа Supabase
- [ ] Production deploy, Prisma migration урсгал
- [ ] Supabase backup тохиргоо шалгах
- [ ] QPay production: 100₮ test багцаар цэнэглэлт → худалдан авалт → багшийн орлого → payout урсгал
- [ ] Mux, verify.mn, Resend production түлхүүрүүдээр шалгах
- [ ] Ажиллуулах заавар (README): орчин, deploy, нууц түлхүүр
