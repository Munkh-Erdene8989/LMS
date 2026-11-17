-- CreateEnum
CREATE TYPE "LiveReminderKind" AS ENUM ('H24', 'M15');

-- CreateTable
CREATE TABLE "live_reminders" (
    "lesson_id" UUID NOT NULL,
    "kind" "LiveReminderKind" NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_reminders_pkey" PRIMARY KEY ("lesson_id","kind","starts_at")
);

-- AddForeignKey
ALTER TABLE "live_reminders" ADD CONSTRAINT "live_reminders_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

