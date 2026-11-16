-- CreateEnum
CREATE TYPE "Role" AS ENUM ('LEARNER', 'TEACHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'LINK');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "avatar_url" TEXT,
    "roles" "Role"[] DEFAULT ARRAY['LEARNER']::"Role"[],
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identifiers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "user_id" UUID,
    "code_hash" TEXT NOT NULL,
    "provider_session_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "rotated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identifiers_value_key" ON "identifiers"("value");

-- CreateIndex
CREATE UNIQUE INDEX "identifiers_user_id_type_key" ON "identifiers"("user_id", "type");

-- CreateIndex
CREATE INDEX "otp_challenges_value_created_at_idx" ON "otp_challenges"("value", "created_at");

-- CreateIndex
CREATE INDEX "otp_challenges_ip_created_at_idx" ON "otp_challenges"("ip", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- AddForeignKey
ALTER TABLE "identifiers" ADD CONSTRAINT "identifiers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

