-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'ERRORED');

-- CreateTable
CREATE TABLE "lesson_videos" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "mux_upload_id" TEXT NOT NULL,
    "mux_asset_id" TEXT,
    "playback_id" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'UPLOADING',
    "duration_seconds" DOUBLE PRECISION,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mux_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "mux_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_videos_mux_upload_id_key" ON "lesson_videos"("mux_upload_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_videos_mux_asset_id_key" ON "lesson_videos"("mux_asset_id");

-- CreateIndex
CREATE INDEX "lesson_videos_lesson_id_idx" ON "lesson_videos"("lesson_id");

-- AddForeignKey
ALTER TABLE "lesson_videos" ADD CONSTRAINT "lesson_videos_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
