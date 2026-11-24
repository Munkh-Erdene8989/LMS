// Demo курс (жинхэнэ DB өгөгдөл): нэг багш, нэг курс, 2 бүлэг, 5 хичээл (2 нь үнэгүй preview).
// ID-ууд тогтмол тул дахин ажиллуулахад давхардахгүй (upsert).
//
//   pnpm --filter @lms/db demo:seed     # үүсгэх / шинэчлэх
//   pnpm --filter @lms/db demo:remove   # бүрэн устгах
//
// Анхаар: худалдан авалт/явц үүссэн бол Purchase-ийн Restrict холбоосоос болж remove амжилтгүй болно
// — тэр үед курсийг админаас DRAFT болгож нууна.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEACHER_ID = 'd3000000-0000-4000-8000-000000000001';
const CATEGORY_ID = 'd3000000-0000-4000-8000-000000000002';
const COURSE_ID = 'd3000000-0000-4000-8000-000000000003';
const SECTION_IDS = ['d3000000-0000-4000-8000-000000000011', 'd3000000-0000-4000-8000-000000000012'];
const lessonId = (n) => `d3000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const qid = (n) => `d3000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;

const md = (lines) => lines.join('\n');

const SECTIONS = [
  {
    title: 'Эхлэл',
    lessons: [
      {
        title: 'Python гэж юу вэ?',
        type: 'TEXT',
        price: 0,
        free: true,
        content: {
          markdown: md([
            '# Python гэж юу вэ?',
            '',
            'Python бол уншихад хялбар, олон салбарт хэрэглэгддэг програмчлалын хэл юм: вэб, өгөгдлийн шинжилгээ, хиймэл оюун, автоматжуулалт.',
            '',
            '## Яагаад Python-оос эхлэх вэ?',
            '',
            '- **Энгийн бичиглэл** — код нь англи өгүүлбэр шиг уншигдана.',
            '- **Том community** — асуултын хариу, сан (library) олон.',
            '- **Ажлын байр** — Монголд ч өгөгдөл, backend чиглэлд эрэлттэй.',
            '',
            '## Анхны програм',
            '',
            '```python',
            'print("Сайн уу, дэлхий!")',
            '```',
            '',
            'Энэ мөр дэлгэцэнд `Сайн уу, дэлхий!` гэж хэвлэнэ. Дараагийн хичээлээр Python-ыг компьютертоо суулгана.',
          ]),
        },
      },
      {
        title: 'Python суулгах ба анхны код',
        type: 'TEXT',
        price: 0,
        free: true,
        content: {
          markdown: md([
            '# Python суулгах',
            '',
            '1. [python.org](https://www.python.org/downloads/) руу орж хамгийн сүүлийн хувилбарыг татна.',
            '2. Windows дээр суулгахдаа **"Add Python to PATH"** сонголтыг заавал чагтална.',
            '3. Terminal (Command Prompt) нээгээд шалгана:',
            '',
            '```bash',
            'python --version',
            '```',
            '',
            '## Анхны файл',
            '',
            '`hello.py` нэртэй файл үүсгээд дараах кодыг бичнэ:',
            '',
            '```python',
            'name = input("Таны нэр: ")',
            'print("Сайн уу,", name)',
            '```',
            '',
            '`python hello.py` гэж ажиллуулахад таны нэрийг асууж, мэндчилнэ.',
          ]),
        },
      },
    ],
  },
  {
    title: 'Үндсэн ойлголтууд',
    lessons: [
      {
        title: 'Хувьсагч ба өгөгдлийн төрөл',
        type: 'TEXT',
        price: 8,
        free: false,
        content: {
          markdown: md([
            '# Хувьсагч ба өгөгдлийн төрөл',
            '',
            'Хувьсагч бол утгыг нэрээр хадгалах сав юм.',
            '',
            '```python',
            'age = 20            # int — бүхэл тоо',
            'price = 12.5        # float — бутархай тоо',
            'city = "Улаанбаатар" # str — текст',
            'is_student = True   # bool — үнэн/худал',
            '```',
            '',
            '`type()` функцээр төрлийг шалгана:',
            '',
            '```python',
            'print(type(age))  # <class \'int\'>',
            '```',
            '',
            '## Дасгал',
            '',
            'Өөрийн нэр, нас, хотыг хувьсагчид хадгалаад нэг өгүүлбэр болгон хэвлэ.',
          ]),
        },
      },
      {
        title: 'Нөхцөл ба давталт',
        type: 'TEXT',
        price: 8,
        free: false,
        content: {
          markdown: md([
            '# Нөхцөл ба давталт',
            '',
            '## if / else',
            '',
            '```python',
            'score = 85',
            'if score >= 90:',
            '    print("A")',
            'elif score >= 80:',
            '    print("B")',
            'else:',
            '    print("C")',
            '```',
            '',
            '## for давталт',
            '',
            '```python',
            'for i in range(1, 6):',
            '    print(i, "дахь удаа")',
            '```',
            '',
            '## Дасгал',
            '',
            '1-ээс 20 хүртэлх тэгш тоонуудыг хэвлэдэг програм бич.',
          ]),
        },
      },
      {
        title: 'Шалгалт: Үндсэн ойлголт',
        type: 'QUIZ',
        price: 4,
        free: false,
        content: {
          passPercent: 60,
          questions: [
            {
              id: qid(1),
              text: '`print(type(3.14))` юу хэвлэх вэ?',
              multiple: false,
              options: [
                { id: qid(11), text: "<class 'int'>" },
                { id: qid(12), text: "<class 'float'>" },
                { id: qid(13), text: "<class 'str'>" },
              ],
              correctOptionIds: [qid(12)],
            },
            {
              id: qid(2),
              text: '`range(1, 4)` ямар тоонуудыг өгөх вэ?',
              multiple: false,
              options: [
                { id: qid(21), text: '1, 2, 3' },
                { id: qid(22), text: '1, 2, 3, 4' },
                { id: qid(23), text: '0, 1, 2, 3' },
              ],
              correctOptionIds: [qid(21)],
            },
            {
              id: qid(3),
              text: 'Аль нь Python-ы өгөгдлийн төрөл вэ? (олон сонголттой)',
              multiple: true,
              options: [
                { id: qid(31), text: 'int' },
                { id: qid(32), text: 'str' },
                { id: qid(33), text: 'char' },
                { id: qid(34), text: 'bool' },
              ],
              correctOptionIds: [qid(31), qid(32), qid(34)],
            },
          ],
        },
      },
    ],
  },
];

async function seed() {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: TEACHER_ID },
      create: { id: TEACHER_ID, name: 'Demo багш', roles: ['LEARNER', 'TEACHER'] },
      update: { name: 'Demo багш', roles: ['LEARNER', 'TEACHER'] },
    });

    // Ижил slug-тай ангилал байвал түүнийг ашиглана.
    const existing = await tx.category.findUnique({ where: { slug: 'programming' } });
    const categoryId =
      existing?.id ??
      (await tx.category.create({ data: { id: CATEGORY_ID, name: 'Програмчлал', slug: 'programming', position: 99 } })).id;

    const courseData = {
      teacherId: TEACHER_ID,
      title: 'Python програмчлалын үндэс (Demo)',
      description:
        'Python-ыг эхнээс нь сурах богино demo курс: суулгах, хувьсагч, нөхцөл, давталт. Эхний 2 хичээл үнэгүй.',
      categoryId,
      level: 'BEGINNER',
      priceCredits: 16,
      status: 'PUBLISHED',
    };
    await tx.course.upsert({
      where: { id: COURSE_ID },
      create: { id: COURSE_ID, ...courseData, submittedAt: now, reviewedAt: now, publishedAt: now },
      update: courseData,
    });

    for (const [si, section] of SECTIONS.entries()) {
      const sectionId = SECTION_IDS[si];
      await tx.section.upsert({
        where: { id: sectionId },
        create: { id: sectionId, courseId: COURSE_ID, title: section.title, position: si },
        update: { title: section.title, position: si },
      });
      for (const [li, l] of section.lessons.entries()) {
        const id = lessonId(si * 10 + li + 1);
        const data = {
          title: l.title,
          type: l.type,
          position: li,
          priceCredits: l.price,
          isFreePreview: l.free,
          content: l.content,
          reviewStatus: 'APPROVED',
          archivedAt: null,
        };
        await tx.lesson.upsert({
          where: { id },
          create: { id, courseId: COURSE_ID, sectionId, approvedAt: now, ...data },
          update: data,
        });
      }
    }
  });
  const lessons = await prisma.lesson.count({ where: { courseId: COURSE_ID } });
  console.log(`Demo курс бэлэн: ${COURSE_ID} (${lessons} хичээл)`);
}

async function remove() {
  await prisma.$transaction(async (tx) => {
    await tx.lesson.deleteMany({ where: { courseId: COURSE_ID } });
    await tx.section.deleteMany({ where: { courseId: COURSE_ID } });
    await tx.course.deleteMany({ where: { id: COURSE_ID } });
    await tx.user.deleteMany({ where: { id: TEACHER_ID } });
    // Зөвхөн энэ script үүсгэсэн, хоосон болсон ангиллыг устгана.
    const left = await tx.course.count({ where: { categoryId: CATEGORY_ID } });
    if (left === 0) await tx.category.deleteMany({ where: { id: CATEGORY_ID } });
  });
  console.log('Demo курс устгагдлаа');
}

const cmd = process.argv[2];
(cmd === 'remove' ? remove() : cmd === 'seed' ? seed() : Promise.reject(new Error('usage: demo-course.mjs seed|remove')))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
