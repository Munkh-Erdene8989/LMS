-- Байгууллагын урилга (ticket 45).

-- CreateEnum
CREATE TYPE "OrgInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELED');

-- CreateTable
CREATE TABLE "organization_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "identifier_type" "IdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "status" "OrgInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_invitations_organization_id_idx" ON "organization_invitations"("organization_id");

-- CreateIndex
CREATE INDEX "organization_invitations_value_idx" ON "organization_invitations"("value");

-- Нэг org × identifier-д хүлээгдэж буй (PENDING) урилга нэг л байна; цуцлах/хүлээн авсны дараа дахин урьж болно.
CREATE UNIQUE INDEX "organization_invitations_one_pending" ON "organization_invitations"("organization_id", "value") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (policy-гүй, deny-all) — 20261118310000_enable_rls-тэй ижил.
ALTER TABLE "organization_invitations" ENABLE ROW LEVEL SECURITY;
