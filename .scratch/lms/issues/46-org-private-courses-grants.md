# 46: Private course зохиох ба байгууллагад олгох

**What to build:** Админ house teacher-ээр одоогийн teacher editor-оор private курс зохиож, нэг эсвэл олон байгууллагад grant/revoke хийнэ. Story 81, 82.

**Blocked by:** 44

**Status:** done

## Хийх
- [x] Teacher editor: курс үүсгэхэд `visibility` сонголт — зөвхөн house teacher-т харагдана. Private үед үнэ, assignment төрөл нуугдана; "Review-д илгээх" оронд "Нийтлэх".
- [x] API: grant нэмэх/хасах (`POST/DELETE /admin/organizations/:id/courses/:courseId`), байгууллагын grant-тай курсуудын жагсаалт, курсийн grant-тай байгууллагуудын жагсаалт. Audit log.
- [x] Web админ: байгууллагын хуудсанд "Курсууд" таб — private курс сонгож олгох / хасах.
- [x] Integration тест: house teacher биш хүн private курс үүсгэх 403; grant/revoke эрхэд шууд нөлөөлөх; public курсийг grant хийх 4xx.

## Шалгах
- typecheck, build, `pnpm test` ногоон.
