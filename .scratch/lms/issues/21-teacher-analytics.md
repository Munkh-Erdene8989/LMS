# 21: Багшийн аналитик

**What to build:** Багшийн dashboard: өдөр/сараар борлуулалт (кредит, ₮), lesson бүрийн худалдан авалт, видео үзэлтийн хугацаа ба зогсдог цэг (Mux Data), курсийн дуусгалтын хувь, referral vs platform харьцаа, орлогын үлдэгдэл.

**Blocked by:** 10, 11

**Status:** done

- [x] Борлуулалтын график (өдөр/сар), хугацааны шүүлтүүр
- [x] Lesson бүрийн худалдан авалт
- [x] Mux Data-аас үзэлт, drop-off
- [x] Дуусгалтын хувь
- [x] Attribution харьцаа
- [x] Зөвхөн өөрийн өгөгдөл
- [x] Integration тест: өөр багшийн өгөгдөл харагдахгүй, тоо зөв

## Хийсэн
- `apps/api/src/analytics/` (GET /teacher/analytics/*), Mux adapter-д `videoEngagement` (HTTP + FakeMux + Disabled), `packages/shared/src/analytics.ts`, `/teacher/analytics` (SVG график), `/teacher/earnings`, `/teacher/referral` холбоос.
- Test purchase хасагдсан, UB өдөр/сар, зөвхөн өөрийн өгөгдөл, referral vs platform; Mux түлхүүр байхгүй/унасан үед graceful.
- Migration шаардлагагүй.
