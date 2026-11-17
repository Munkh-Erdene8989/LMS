import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Course, type CourseLevel, type Lesson, type LessonType } from '@lms/db';
import {
  COVER_MAX_BYTES,
  COVER_TYPES,
  liveEndsAt,
  PDF_MAX_BYTES,
  type CourseDetail,
  type CourseSummary,
  type UploadTicket,
} from '@lms/shared';
import { STORAGE, type StorageAdapter } from '../adapters/storage';
import { PrismaService } from '../prisma/prisma.service';
import {
  activeLessons,
  courseDetailInclude,
  courseProblems,
  lessonProblems,
  toCourseDetail,
  toCourseSummary,
} from './course.view';
import { CatalogErrors as E } from './errors';
import { isAvailableType, LESSON_TYPES, type LiveContent, type PdfContent, type VideoContent } from './lesson-types';
import { LiveLessonsService } from './live-lessons.service';

export interface CourseUpdate {
  title?: string;
  description?: string;
  categoryId?: string | null;
  level?: CourseLevel;
  priceCredits?: number | null;
  coverKey?: string | null;
}

export interface LessonUpdate {
  title?: string;
  priceCredits?: number;
  isFreePreview?: boolean;
  content?: unknown;
}

const COVER_EXT: Record<(typeof COVER_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Багшийн курс засварлах. Дүрэм:
 * - Курс `IN_REVIEW` үед юу ч засахгүй.
 * - `DRAFT` / `REJECTED` курсэд бүгд чөлөөтэй (устгах = бүрмөсөн).
 * - `PUBLISHED` курсэд: мета мэдээлэл засна; шинэ lesson `DRAFT`-аар нэмэгдэж тусдаа шалгагдана;
 *   `APPROVED` lesson-ы агуулга түгжигдэнэ (худалдан авсан хүмүүст өөрчлөгдөхгүй), устгавал архивлана.
 *   Үл хамаарах: LIVE хичээлийн хуваарь, линк (ticket 14); бичлэг болгосон live-д бичлэг оруулах (ticket 10, `videoUploadAllowed`).
 * Бусдын курс 404 (оршин буйг ч илчлэхгүй).
 */
@Injectable()
export class CourseAuthoringService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    private readonly live: LiveLessonsService,
  ) {}

  // ---- курс ----------------------------------------------------------------

  async list(teacherId: string): Promise<CourseSummary[]> {
    const rows = await this.prisma.course.findMany({
      where: { teacherId },
      orderBy: { updatedAt: 'desc' },
      include: { lessons: { select: { reviewStatus: true, archivedAt: true } } },
    });
    return rows.map((r) => toCourseSummary(r, this.storage));
  }

  async create(teacherId: string, title: string): Promise<CourseDetail> {
    const course = await this.prisma.course.create({ data: { teacherId, title } });
    return this.detail(teacherId, course.id);
  }

  async detail(teacherId: string, courseId: string): Promise<CourseDetail> {
    return toCourseDetail(await this.load(teacherId, courseId), this.storage);
  }

  async update(teacherId: string, courseId: string, input: CourseUpdate): Promise<CourseDetail> {
    const course = await this.editableCourse(teacherId, courseId);
    if (input.categoryId) await this.assertCategory(input.categoryId);
    if (input.coverKey) await this.assertCover(course.id, input.coverKey);
    await this.prisma.course.update({ where: { id: course.id }, data: input });
    return this.detail(teacherId, courseId);
  }

  async remove(teacherId: string, courseId: string): Promise<void> {
    const course = await this.ownCourse(teacherId, courseId);
    if (course.status === 'PUBLISHED' || course.status === 'IN_REVIEW' || course.publishedAt) {
      throw E.courseNotDeletable();
    }
    await this.prisma.$transaction([
      this.prisma.lesson.deleteMany({ where: { courseId } }),
      this.prisma.section.deleteMany({ where: { courseId } }),
      this.prisma.course.delete({ where: { id: courseId } }),
    ]);
  }

  async coverUpload(teacherId: string, courseId: string, contentType: string): Promise<UploadTicket> {
    const course = await this.editableCourse(teacherId, courseId);
    const ext = COVER_EXT[contentType as keyof typeof COVER_EXT];
    if (!ext) throw E.invalidUpload('Зөвхөн JPG, PNG, WebP зураг.');
    const key = `courses/${course.id}/cover-${randomUUID()}.${ext}`;
    const target = await this.storage.createUploadUrl('public', key);
    return { key, ...target };
  }

  // ---- section ---------------------------------------------------------------

  async addSection(teacherId: string, courseId: string, title: string): Promise<CourseDetail> {
    const course = await this.editableCourse(teacherId, courseId);
    const last = await this.prisma.section.aggregate({ where: { courseId: course.id }, _max: { position: true } });
    await this.prisma.section.create({ data: { courseId, title, position: (last._max.position ?? -1) + 1 } });
    return this.detail(teacherId, courseId);
  }

  async renameSection(teacherId: string, sectionId: string, title: string): Promise<CourseDetail> {
    const section = await this.ownSection(teacherId, sectionId);
    await this.prisma.section.update({ where: { id: sectionId }, data: { title } });
    return this.detail(teacherId, section.courseId);
  }

  async removeSection(teacherId: string, sectionId: string): Promise<CourseDetail> {
    const section = await this.ownSection(teacherId, sectionId);
    if ((await this.prisma.lesson.count({ where: { sectionId } })) > 0) throw E.sectionNotEmpty();
    await this.prisma.section.delete({ where: { id: sectionId } });
    return this.detail(teacherId, section.courseId);
  }

  /** Бүлэг, хичээлийн дараалал (хичээлийг бүлэг хооронд зөөж болно). Бүх id заавал байна. */
  async reorder(
    teacherId: string,
    courseId: string,
    layout: { id: string; lessonIds: string[] }[],
  ): Promise<CourseDetail> {
    const course = await this.editableCourse(teacherId, courseId);
    const full = await this.load(teacherId, course.id);
    const sectionIds = full.sections.map((s) => s.id).sort();
    const lessonIds = full.sections.flatMap((s) => s.lessons.map((l) => l.id)).sort();
    const givenSections = layout.map((s) => s.id).sort();
    const givenLessons = layout.flatMap((s) => s.lessonIds).sort();
    if (JSON.stringify(sectionIds) !== JSON.stringify(givenSections) || JSON.stringify(lessonIds) !== JSON.stringify(givenLessons)) {
      throw E.invalidCurriculum();
    }
    await this.prisma.$transaction(
      layout.flatMap((s, si) => [
        this.prisma.section.update({ where: { id: s.id }, data: { position: si } }),
        ...s.lessonIds.map((lessonId, li) =>
          this.prisma.lesson.update({ where: { id: lessonId }, data: { sectionId: s.id, position: li } }),
        ),
      ]),
    );
    return this.detail(teacherId, courseId);
  }

  // ---- lesson ----------------------------------------------------------------

  async addLesson(teacherId: string, sectionId: string, input: { title: string; type: LessonType }): Promise<CourseDetail> {
    const section = await this.ownSection(teacherId, sectionId);
    if (!isAvailableType(input.type)) throw E.lessonTypeUnavailable();
    const last = await this.prisma.lesson.aggregate({ where: { sectionId }, _max: { position: true } });
    await this.prisma.lesson.create({
      data: {
        courseId: section.courseId,
        sectionId,
        title: input.title,
        type: input.type,
        position: (last._max.position ?? -1) + 1,
        content: LESSON_TYPES[input.type]!.empty as Prisma.InputJsonValue,
      },
    });
    return this.detail(teacherId, section.courseId);
  }

  /**
   * Live хичээлийн хуваарь, линк нийтлэгдсэн (APPROVED) ч засагдана — цаг хойшлох, линк солигдох нь
   * ажиллагааны өөрчлөлт. Эхлэх цаг өөрчлөгдвөл сануулга дахин товлогдож, эзэмшигчдэд мэдэгдэнэ.
   */
  async updateLesson(teacherId: string, lessonId: string, input: LessonUpdate): Promise<CourseDetail> {
    const lesson = await this.editableLesson(teacherId, lessonId);
    const data: Prisma.LessonUpdateInput = {
      title: input.title,
      priceCredits: input.priceCredits,
      isFreePreview: input.isFreePreview,
    };
    let content: unknown;
    if (input.content !== undefined) {
      if (lesson.reviewStatus === 'APPROVED' && lesson.type !== 'LIVE') throw E.contentLocked();
      content = await this.parseContent(lesson, input.content);
      data.content = content as Prisma.InputJsonValue;
    }
    await this.prisma.lesson.update({ where: { id: lessonId }, data });
    if (lesson.type === 'LIVE' && content !== undefined) {
      await this.live.scheduleChanged(lesson, lesson.content as unknown as LiveContent, content as LiveContent);
    }
    return this.detail(teacherId, lesson.courseId);
  }

  /**
   * Дууссан live хичээлийг бичлэгийн (VIDEO) хичээл болгоно. Lesson-ы id, эрх, үнэ, шалгалтын төлөв
   * хэвээр — эзэмшигчид бичлэгийг үзнэ. Бичлэгийг `POST /teacher/lessons/:id/video-upload`-оор (media) оруулна.
   */
  async convertLiveToVideo(teacherId: string, lessonId: string, now = new Date()): Promise<CourseDetail> {
    const lesson = await this.editableLesson(teacherId, lessonId);
    if (lesson.type !== 'LIVE') throw E.notLive();
    const c = lesson.content as unknown as LiveContent;
    if (!c.startsAt || !c.durationMinutes || now.getTime() < new Date(liveEndsAt(c.startsAt, c.durationMinutes)).getTime()) {
      throw E.liveNotEnded();
    }
    const content: VideoContent = {
      ...(LESSON_TYPES.VIDEO!.empty as VideoContent),
      fromLive: { startsAt: c.startsAt, durationMinutes: c.durationMinutes },
    };
    const { count } = await this.prisma.lesson.updateMany({
      where: { id: lesson.id, type: 'LIVE' },
      data: { type: 'VIDEO', content: content as unknown as Prisma.InputJsonValue },
    });
    if (count === 0) throw E.notLive();
    return this.detail(teacherId, lesson.courseId);
  }

  /** Нийтлэгдсэн (APPROVED) lesson-ыг архивлана, бусдыг бүрмөсөн устгана. */
  async removeLesson(teacherId: string, lessonId: string): Promise<CourseDetail> {
    const lesson = await this.editableLesson(teacherId, lessonId);
    if (lesson.reviewStatus === 'APPROVED') {
      await this.prisma.lesson.update({ where: { id: lessonId }, data: { archivedAt: new Date() } });
    } else {
      await this.prisma.lesson.delete({ where: { id: lessonId } });
    }
    return this.detail(teacherId, lesson.courseId);
  }

  async pdfUpload(teacherId: string, lessonId: string): Promise<UploadTicket> {
    const lesson = await this.editableLesson(teacherId, lessonId);
    if (lesson.type !== 'PDF') throw E.typeChangeForbidden();
    if (lesson.reviewStatus === 'APPROVED') throw E.contentLocked();
    const key = `lessons/${lesson.id}/${randomUUID()}.pdf`;
    const target = await this.storage.createUploadUrl('private', key);
    return { key, ...target };
  }

  // ---- шалгуулах -------------------------------------------------------------

  /**
   * DRAFT/REJECTED курс → IN_REVIEW (бүх шинэ lesson-ын хамт).
   * PUBLISHED курс → зөвхөн шинэ (DRAFT/REJECTED) lesson-ууд IN_REVIEW; курс нийтлэгдсэн хэвээр.
   */
  async submit(teacherId: string, courseId: string): Promise<CourseDetail> {
    const course = await this.load(teacherId, courseId);
    if (course.status === 'IN_REVIEW') throw E.courseInReview();
    const pending = activeLessons(course).filter((l) => l.reviewStatus === 'DRAFT' || l.reviewStatus === 'REJECTED');

    if (course.status === 'PUBLISHED') {
      if (pending.length === 0) throw E.nothingToSubmit();
      const problems = pending.flatMap((l) => lessonProblems(l).map((p) => `"${l.title}": ${p}`));
      if (problems.length) throw E.notReady(problems);
    } else {
      const problems = courseProblems(course);
      if (problems.length) throw E.notReady(problems);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.course.updateMany({
        where: { id: course.id, status: course.status },
        data:
          course.status === 'PUBLISHED'
            ? { submittedAt: now }
            : { status: 'IN_REVIEW', submittedAt: now, reviewNote: null },
      });
      if (count === 0) throw E.courseInReview();
      await tx.lesson.updateMany({
        where: { id: { in: pending.map((l) => l.id) } },
        data: { reviewStatus: 'IN_REVIEW', reviewNote: null },
      });
    });
    return this.detail(teacherId, courseId);
  }

  // ---- дотоод ----------------------------------------------------------------

  private async load(teacherId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, teacherId },
      include: courseDetailInclude,
    });
    if (!course) throw E.courseNotFound();
    return course;
  }

  private async ownCourse(teacherId: string, courseId: string): Promise<Course> {
    const course = await this.prisma.course.findFirst({ where: { id: courseId, teacherId } });
    if (!course) throw E.courseNotFound();
    return course;
  }

  private async editableCourse(teacherId: string, courseId: string): Promise<Course> {
    const course = await this.ownCourse(teacherId, courseId);
    if (course.status === 'IN_REVIEW') throw E.courseInReview();
    return course;
  }

  private async ownSection(teacherId: string, sectionId: string) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, course: { teacherId } },
      include: { course: true },
    });
    if (!section) throw E.sectionNotFound();
    if (section.course.status === 'IN_REVIEW') throw E.courseInReview();
    return section;
  }

  /** Багшийн засварлаж болох lesson (өөрийн, архивлаагүй, шалгагдаагүй). Видео upload (media) ч ашиглана. */
  async editableLesson(teacherId: string, lessonId: string): Promise<Lesson> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, course: { teacherId } },
      include: { course: true },
    });
    if (!lesson || lesson.archivedAt) throw E.lessonNotFound();
    if (lesson.course.status === 'IN_REVIEW') throw E.courseInReview();
    if (lesson.reviewStatus === 'IN_REVIEW') throw E.lessonInReview();
    return lesson;
  }

  private async parseContent(lesson: Lesson, raw: unknown): Promise<unknown> {
    const def = LESSON_TYPES[lesson.type];
    if (!def) throw E.lessonTypeUnavailable();
    const parsed = def.input.safeParse(raw);
    if (!parsed.success) {
      const reason = parsed.error.issues.map((i) => i.message).join('; ');
      if (lesson.type === 'LIVE') throw E.invalidLive(reason);
      if (lesson.type === 'ASSIGNMENT') throw E.invalidAssignment(reason);
      throw E.typeChangeForbidden();
    }
    if (lesson.type === 'LIVE') {
      const next = parsed.data as LiveContent;
      const prev = lesson.content as unknown as LiveContent;
      // Хуучин цагаа хэвээр үлдээж (жишээ нь зөвхөн линк солих) байвал шалгахгүй.
      if (next.startsAt !== prev.startsAt && new Date(next.startsAt!).getTime() <= Date.now()) throw E.liveStartInPast();
      return next;
    }
    if (lesson.type !== 'PDF') return parsed.data;

    const { fileKey, fileName } = parsed.data as { fileKey: string; fileName: string };
    if (!fileKey.startsWith(`lessons/${lesson.id}/`)) throw E.invalidUpload('Файлын зам буруу.');
    const info = await this.storage.info('private', fileKey);
    if (!info) throw E.invalidUpload('Файл upload хийгдээгүй байна.');
    if (info.contentType !== 'application/pdf') throw E.invalidUpload('Зөвхөн PDF файл.');
    if (info.size > PDF_MAX_BYTES) throw E.invalidUpload('PDF 50MB-аас ихгүй байх ёстой.');
    const content: PdfContent = { fileKey, fileName, size: info.size };
    return content;
  }

  private async assertCover(courseId: string, key: string): Promise<void> {
    if (!key.startsWith(`courses/${courseId}/`)) throw E.invalidUpload('Зургийн зам буруу.');
    const info = await this.storage.info('public', key);
    if (!info) throw E.invalidUpload('Зураг upload хийгдээгүй байна.');
    if (!(COVER_TYPES as readonly string[]).includes(info.contentType)) throw E.invalidUpload('Зөвхөн JPG, PNG, WebP зураг.');
    if (info.size > COVER_MAX_BYTES) throw E.invalidUpload('Зураг 5MB-аас ихгүй байх ёстой.');
  }

  private async assertCategory(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw E.categoryNotFound();
  }
}
