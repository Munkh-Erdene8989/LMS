/**
 * Түр demo өгөгдөл (ticket 33b) — хичээл үзэх (`/catalog/lessons/:id`) ба «Миний сургалт» (`/learning/*`).
 * ЗӨВХӨН ХАРУУЛАХ. Хожим `lib/demo/`-той хамт бүхэлд нь устгана.
 *
 * Demo-д 1-р (Python), 4-р (Figma) курсийг «эзэмшсэн» гэж үзнэ; бусад курсийн зөвхөн үнэгүй (эхний) хичээл нээлттэй,
 * үлдсэн нь түгжээтэй. Видео хичээл Mux id-гүй (`status: null`) тул тоглуулагчийн оронд тайван placeholder гарна.
 */
import type {
  CertificateStatus,
  LessonContent,
  LessonLearningState,
  LessonProgressView,
  MyCourseCard,
  MyCourseDetail,
  MyCourseLesson,
  PublicLessonContent,
  PublicLessonItem,
} from '@lms/shared';
import { DEMO_COURSES, DEMO_TEACHERS, type DemoCourse } from './data';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

/** Курсийн n → дууссан хичээлийн тоо. (`data.ts`-ийн ENROLLED_SEEDS-тэй ижил түлхүүртэй.) */
const ENROLLED: Record<number, number> = { 1: 3, 4: 1 };

const enrolled = (c: DemoCourse) => c.seed.n in ENROLLED;

interface LessonRef {
  course: DemoCourse;
  item: PublicLessonItem;
  /** Курс доторх дарааллын индекс */
  index: number;
}

const LESSONS = new Map<string, LessonRef>();
for (const course of DEMO_COURSES) {
  course.sections.flatMap((s) => s.lessons).forEach((item, index) => LESSONS.set(item.id, { course, item, index }));
}

const markdownFor = (title: string) => `## ${title}

Энэ хичээлд өнөөдрийн сэдвийн гол ойлголтыг **товч, жишээтэй** тайлбарлана.

### Юуг сурах вэ
- Үндсэн ойлголт ба түүний хэрэглээ
- Түгээмэл алдаа, тэдгээрээс сэргийлэх арга
- Өөрөө туршиж үзэх жижиг дасгал

### Хураангуй
Хичээлийн төгсгөлд өөрийн ажил дээр *нэг зүйлийг* шууд хэрэглэж үзээрэй. Жижиг алхам бүр дараагийнхаа суурь болно.`;

function contentFor(ref: LessonRef): LessonContent {
  const { item } = ref;
  switch (item.type) {
    case 'TEXT':
      return { type: 'TEXT', markdown: markdownFor(item.title) };
    case 'ASSIGNMENT':
      return {
        type: 'ASSIGNMENT',
        maxScore: 100,
        instructions: `## ${item.title}\n\nӨмнөх хичээлүүдээр сурсан зүйлээ ашиглан жижиг ажил хийж илгээнэ үү.\n\n1. Даалгаврын нөхцөлийг сайтар уншина\n2. Хариултаа текстээр бичнэ эсвэл файл хавсаргана\n3. Багш шалгаж, оноо болон санал бичнэ`,
      };
    case 'QUIZ':
      return {
        type: 'QUIZ',
        passPercent: 70,
        questions: [
          {
            id: `${item.id}-q1`,
            text: 'Энэ хэсгийн хамгийн чухал ойлголт аль нь вэ?',
            multiple: false,
            options: [
              { id: `${item.id}-q1-a`, text: 'Суурь ойлголтыг эхэлж ойлгох' },
              { id: `${item.id}-q1-b`, text: 'Бүх зүйлийг цээжлэх' },
              { id: `${item.id}-q1-c`, text: 'Дасгал хийхгүй өнгөрөх' },
            ],
          },
          {
            id: `${item.id}-q2`,
            text: 'Дараахаас үр дүнтэй суралцах аргуудыг сонгоно уу.',
            multiple: true,
            options: [
              { id: `${item.id}-q2-a`, text: 'Өдөр бүр бага багаар давтах' },
              { id: `${item.id}-q2-b`, text: 'Сурсанаа жишээнд хэрэглэх' },
              { id: `${item.id}-q2-c`, text: 'Нэг дор бүгдийг үзэж дуусгах' },
            ],
          },
          {
            id: `${item.id}-q3`,
            text: 'Асуулт гарвал юу хийх вэ?',
            multiple: false,
            options: [
              {
                id: `${item.id}-q3-a`,
                text: 'Community-д асууж, багшаас тодруулах',
              },
              { id: `${item.id}-q3-b`, text: 'Орхиж цааш явах' },
            ],
          },
        ],
      };
    case 'PDF':
      return { type: 'PDF', fileName: null, size: null, url: null };
    case 'LIVE':
      return {
        type: 'LIVE',
        startsAt: null,
        durationMinutes: null,
        endsAt: null,
        meetingUrl: null,
      };
    default:
      // Видео: Mux id-гүй (status null) → хуудас placeholder харуулна
      return {
        type: 'VIDEO',
        status: null,
        durationSeconds: null,
        error: null,
        fromLive: null,
      };
  }
}

/** `GET /catalog/lessons/:id`. `'locked'` = эрхгүй (API-ийн 403), `undefined` = demo биш. */
export function demoLesson(id: string): PublicLessonContent | 'locked' | undefined {
  const ref = LESSONS.get(id);
  if (!ref) return undefined;
  const own = enrolled(ref.course);
  if (!own && !ref.item.isFreePreview) return 'locked';
  return {
    lesson: ref.item,
    access: own ? 'OWNED' : 'PREVIEW',
    course: { id: ref.course.id, title: ref.course.seed.title },
    content: contentFor(ref),
  };
}

function progressOf(ref: LessonRef): LessonProgressView {
  const done = ref.index < (ENROLLED[ref.course.seed.n] ?? 0);
  return {
    lessonId: ref.item.id,
    completed: done,
    completedAt: done ? ago(3 + ref.index) : null,
    watchedPercent: done && ref.item.type === 'VIDEO' ? 100 : 0,
    bestScorePercent: done && ref.item.type === 'QUIZ' ? 85 : null,
    lastViewedAt: done ? ago(2 + ref.index) : null,
  };
}

function lessonState(id: string): LessonLearningState | undefined {
  const ref = LESSONS.get(id);
  if (!ref) return undefined;
  return {
    progress: progressOf(ref),
    quiz:
      ref.item.type === 'QUIZ'
        ? {
            passPercent: 70,
            questionCount: 3,
            bestScorePercent: null,
            passed: false,
            attempts: [],
            nextAttemptAt: null,
          }
        : null,
    assignment: ref.item.type === 'ASSIGNMENT' ? { maxScore: 100, canSubmit: enrolled(ref.course), submissions: [] } : null,
  };
}

function summary(course: DemoCourse) {
  const all = course.sections.flatMap((s) => s.lessons);
  const completed = Math.min(ENROLLED[course.seed.n] ?? 0, all.length);
  const next = all[completed];
  return {
    ownedLessonCount: all.length,
    completedLessonCount: completed,
    progressPercent: all.length ? Math.floor((completed / all.length) * 100) : 0,
    continueLessonId: next?.id ?? null,
    lastViewedAt: completed > 0 ? ago(1) : null,
  };
}

const teacherOf = (c: DemoCourse) => {
  const t = DEMO_TEACHERS[c.seed.teacher - 1]!;
  return { id: t.ref.id, name: t.ref.name };
};

function myCard(c: DemoCourse): MyCourseCard {
  return {
    id: c.id,
    title: c.seed.title,
    coverUrl: null,
    teacher: teacherOf(c),
    ownsCourse: true,
    organizations: [],
    isPrivate: false,
    locked: false,
    lessonCount: c.sections.reduce((n, s) => n + s.lessons.length, 0),
    ...summary(c),
  };
}

function myDetail(c: DemoCourse): MyCourseDetail {
  return {
    id: c.id,
    title: c.seed.title,
    coverUrl: null,
    teacher: teacherOf(c),
    ownsCourse: true,
    organizations: [],
    isPrivate: false,
    locked: false,
    ...summary(c),
    sections: c.sections.map((s) => ({
      id: s.id,
      title: s.title,
      lessons: s.lessons.map((item): MyCourseLesson => {
        const ref = LESSONS.get(item.id)!;
        return {
          id: item.id,
          title: item.title,
          type: item.type,
          priceCredits: item.priceCredits,
          isFreePreview: item.isFreePreview,
          archived: false,
          owned: true,
          progress: progressOf(ref),
        };
      }),
    })),
  };
}

function certificateStatus(c: DemoCourse): CertificateStatus {
  const counted = c.sections.flatMap((s) => s.lessons).filter((l) => l.type !== 'ASSIGNMENT');
  const completed = Math.min(ENROLLED[c.seed.n] ?? 0, counted.length);
  return {
    certificate: null,
    eligibility: {
      ownsCourse: true,
      viaOrganization: false,
      lessonCount: counted.length,
      completedLessonCount: completed,
      quizCount: counted.filter((l) => l.type === 'QUIZ').length,
      quizAveragePercent: null,
      minQuizAveragePercent: 70,
      nameMissing: false,
      eligible: false,
    },
  };
}

/** `/learning/...` GET path-ийн сегментүүд (`learning`-ийн дараах) → fixture. */
export function demoLearning(seg: string[]): unknown | undefined {
  const [a, b, c] = seg;
  if (a === 'courses') {
    if (!b) return DEMO_COURSES.filter(enrolled).map(myCard);
    const course = DEMO_COURSES.find((x) => x.id === b && enrolled(x));
    if (!course) return undefined;
    if (!c) return myDetail(course);
    if (c === 'certificate') return certificateStatus(course);
    return undefined;
  }
  if (a === 'certificates' && !b) return [];
  if (a === 'lessons' && b && !c) return lessonState(b);
  return undefined;
}
