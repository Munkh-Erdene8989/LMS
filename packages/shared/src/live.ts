/**
 * Live хичээл (ticket 14). Цагийг Улаанбаатарын цагаар оруулж, харуулна.
 * Монгол 2017 оноос хойш зуны цаг хэрэглэдэггүй тул UTC+08:00 тогтмол.
 */
export const LIVE_TIMEZONE = 'Asia/Ulaanbaatar';
const UB_OFFSET_MS = 8 * 60 * 60_000;

export const LIVE_DURATION_MIN = 15;
export const LIVE_DURATION_MAX = 600;

/** Эхлэхээс өмнөх сануулгууд */
export const LIVE_REMINDERS = [
  { kind: 'H24', beforeMs: 24 * 60 * 60_000 },
  { kind: 'M15', beforeMs: 15 * 60_000 },
] as const;
export type LiveReminderKind = (typeof LIVE_REMINDERS)[number]['kind'];

/** `SCHEDULED` — эхлээгүй, `LIVE` — явагдаж байна, `ENDED` — дууссан (бичлэг болгож болно) */
export type LiveState = 'SCHEDULED' | 'LIVE' | 'ENDED';

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `YYYY-MM-DDTHH:mm` (Улаанбаатарын цаг, `<input type="datetime-local">`) → ISO (UTC). Буруу бол null. */
export function ubLocalToIso(local: string): string | null {
  const m = LOCAL_RE.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(ms);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  return new Date(ms - UB_OFFSET_MS).toISOString();
}

/** ISO → `YYYY-MM-DDTHH:mm` (Улаанбаатарын цаг). */
export function isoToUbLocal(iso: string): string {
  return new Date(new Date(iso).getTime() + UB_OFFSET_MS).toISOString().slice(0, 16);
}

/** ISO → `YYYY-MM-DD HH:mm` (Улаанбаатарын цаг) — мэдэгдэл, UI-д. */
export function formatUbDateTime(iso: string): string {
  return isoToUbLocal(iso).replace('T', ' ');
}

export function liveEndsAt(startsAt: string, durationMinutes: number): string {
  return new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString();
}

export function liveState(startsAt: string, durationMinutes: number, now: Date = new Date()): LiveState {
  if (now.getTime() < new Date(startsAt).getTime()) return 'SCHEDULED';
  return now.getTime() < new Date(liveEndsAt(startsAt, durationMinutes)).getTime() ? 'LIVE' : 'ENDED';
}

/** `GET /teacher/live-lessons` — багшийн удахгүй болох / явагдаж буй live хичээл (story 63) */
export interface TeacherLiveItem {
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  courseTitle: string;
  /** ISO (UTC); UI `formatUbDateTime`-ээр Улаанбаатарын цагаар харуулна */
  startsAt: string;
  durationMinutes: number;
  endsAt: string;
  state: Exclude<LiveState, 'ENDED'>;
  /** Шалгагдаагүй (DRAFT/PENDING) бол суралцагчид хараахан харахгүй */
  published: boolean;
  /** Багшид линк харагдана (өөрийн хичээл) */
  meetingUrl: string | null;
}
