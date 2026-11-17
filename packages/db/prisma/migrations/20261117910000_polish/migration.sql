-- Ticket 10 үлдэгдэл: устгагдсан видеоны Mux asset-ийг цэвэрлэх дараалал.
-- CreateTable
CREATE TABLE "mux_orphans" (
    "video_id" UUID NOT NULL,
    "mux_upload_id" TEXT NOT NULL,
    "mux_asset_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mux_orphans_pkey" PRIMARY KEY ("video_id")
);

-- CreateIndex
CREATE INDEX "mux_orphans_created_at_idx" ON "mux_orphans"("created_at");

-- `lesson_videos` мөр устах бүрт (lesson/курс устгахад cascade-аар ч) Mux-ийн id-г хадгална.
-- Catalog модуль media-г мэдэхгүй хэвээр; цэвэрлэгээг media-ийн `mux.orphan-cleanup` cron хийнэ.
CREATE FUNCTION "lesson_videos_enqueue_mux_orphan"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "mux_orphans" ("video_id", "mux_upload_id", "mux_asset_id")
  VALUES (OLD."id", OLD."mux_upload_id", OLD."mux_asset_id")
  ON CONFLICT ("video_id") DO NOTHING;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "lesson_videos_mux_orphan"
AFTER DELETE ON "lesson_videos"
FOR EACH ROW EXECUTE FUNCTION "lesson_videos_enqueue_mux_orphan"();
