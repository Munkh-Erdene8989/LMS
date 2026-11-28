-- Байгууллагын хаалттай сургалт (ticket 44): organizations, гишүүнчлэл, course grant, courses.visibility.

-- CreateEnum
CREATE TYPE "CourseVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN "visibility" "CourseVisibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "contract_ends_at" TIMESTAMP(3) NOT NULL,
    "seat_limit" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_course_grants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_course_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_members_organization_id_idx" ON "organization_members"("organization_id");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- Нэг org × user-д идэвхтэй (хасагдаагүй) гишүүнчлэл нэг л байна; хасагдсаны дараа дахин нэмж болно.
CREATE UNIQUE INDEX "organization_members_one_active" ON "organization_members"("organization_id", "user_id") WHERE "removed_at" IS NULL;

-- CreateIndex
CREATE INDEX "organization_course_grants_course_id_idx" ON "organization_course_grants"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_course_grants_organization_id_course_id_key" ON "organization_course_grants"("organization_id", "course_id");

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_course_grants" ADD CONSTRAINT "organization_course_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_course_grants" ADD CONSTRAINT "organization_course_grants_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase PostgREST-ээс хамгаалах: шинэ хүснэгтүүдэд RLS (policy-гүй, deny-all) — 20261118310000_enable_rls-тэй ижил.
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_course_grants" ENABLE ROW LEVEL SECURITY;
