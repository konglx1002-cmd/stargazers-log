-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDiary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "completedTasks" TEXT NOT NULL,
    "problems" TEXT NOT NULL,
    "nextPlan" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDiary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_userId_archivedAt_status_idx" ON "Project"("userId", "archivedAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_userId_id_key" ON "Project"("userId", "id");

-- CreateIndex
CREATE INDEX "ProjectDiary_userId_projectId_entryDate_createdAt_id_idx" ON "ProjectDiary"("userId", "projectId", "entryDate" DESC, "createdAt" DESC, "id");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDiary" ADD CONSTRAINT "ProjectDiary_userId_projectId_fkey" FOREIGN KEY ("userId", "projectId") REFERENCES "Project"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
