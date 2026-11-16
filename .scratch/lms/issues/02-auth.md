# 02: Нэвтрэлт (утас / имэйл OTP)

**What to build:** Хэрэглэгч утас (verify.mn SMS OTP) эсвэл имэйл (Resend OTP)-ийг сонгож бүртгүүлж, нэвтэрнэ. API JWT access + refresh token-ыг httpOnly cookie-д олгоно. Хэрэглэгч profile-оо засаж, хоёр дахь identifier-ээ холбож баталгаажуулна. Бүх төхөөрөмжөөс гарах боломжтой.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Утсаар OTP авч нэвтэрнэ (verify.mn adapter)
- [ ] Имэйлээр OTP авч нэвтэрнэ (Resend adapter)
- [ ] OTP 6 оронтой, 5 минут хүчинтэй, нэг удаа ашиглагдана
- [ ] Rate limit: identifier болон IP-ээр
- [ ] Access/refresh token httpOnly cookie, refresh rotation
- [ ] Хоёр дахь identifier холбох; аль хэдийн өөр аккаунтад байгаа бол татгалзана
- [ ] Profile (нэр, avatar) засах
- [ ] Бүх төхөөрөмжөөс гарах
- [ ] Role суурь: learner (анхдагч), teacher, admin
- [ ] Integration тест: бүртгэл, нэвтрэлт, буруу/хугацаа дууссан OTP, холболт
