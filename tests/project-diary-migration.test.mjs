import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createEmptyPostgresTestDatabase,
  createPostgresTestDatabase,
  runMigrationDeploy,
} from "./postgres-test-database.mjs";

const migrationName = "20261020152832_add_project_diaries";

function serializeDiaries(diaries) {
  return diaries.map((diary) => ({
    ...diary,
    date: diary.date.toISOString(),
    createdAt: diary.createdAt.toISOString(),
    updatedAt: diary.updatedAt.toISOString(),
  }));
}

async function createInitialMigrationBundle() {
  const root = await mkdtemp(join(tmpdir(), "scientific-growth-log-stage2-"));
  const migrations = join(root, "migrations");
  const initialMigration = join(migrations, "20261014000000_postgresql_init");

  await mkdir(initialMigration, { recursive: true });
  await copyFile("prisma/schema.prisma", join(root, "schema.prisma"));
  await copyFile("prisma/migrations/migration_lock.toml", join(migrations, "migration_lock.toml"));
  await copyFile(
    "prisma/migrations/20261014000000_postgresql_init/migration.sql",
    join(initialMigration, "migration.sql"),
  );

  return {
    root,
    schemaPath: join(root, "schema.prisma"),
  };
}

test("project diary migration is additive and creates an empty database", async () => {
  const sql = await readFile(`prisma/migrations/${migrationName}/migration.sql`, "utf8");

  assert.match(sql, /CREATE TYPE "ProjectStatus"/);
  assert.match(sql, /CREATE TABLE "Project"/);
  assert.match(sql, /CREATE TABLE "ProjectDiary"/);
  assert.match(sql, /FOREIGN KEY \("userId", "projectId"\)/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/);
  assert.doesNotMatch(sql, /ALTER TABLE "(?:User|Account|Session|Verification|Diary)"/);

  const database = await createPostgresTestDatabase("project_diary_empty_test");
  try {
    assert.equal(await database.prisma.project.count(), 0);
    assert.equal(await database.prisma.projectDiary.count(), 0);
  } finally {
    await database.cleanup();
  }
});

test("upgrades existing diaries and enforces project diary ownership", async () => {
  const database = await createEmptyPostgresTestDatabase("project_diary_upgrade_test");
  const initialBundle = await createInitialMigrationBundle();

  try {
    await runMigrationDeploy(database.databaseUrl, initialBundle.schemaPath);

    await database.prisma.user.createMany({
      data: [
        {
          id: "stage2-user-a",
          name: "阶段二用户 A",
          email: "stage2-a@example.com",
          timeZone: "Asia/Shanghai",
        },
        {
          id: "stage2-user-b",
          name: "阶段二用户 B",
          email: "stage2-b@example.com",
          timeZone: "Asia/Tokyo",
        },
      ],
    });

    await database.prisma.diary.createMany({
      data: [
        {
          id: "legacy-diary-a",
          userId: "stage2-user-a",
          date: new Date("2026-10-18T00:00:00.000Z"),
          completedTasks: "保留用户 A 的完成事项",
          problems: "保留用户 A 的问题",
          nextPlan: "保留用户 A 的计划",
          content: "保留用户 A 的旧正文",
          createdAt: new Date("2026-10-18T01:00:00.000Z"),
          updatedAt: new Date("2026-10-18T02:00:00.000Z"),
        },
        {
          id: "legacy-diary-b",
          userId: "stage2-user-b",
          date: new Date("2026-10-19T00:00:00.000Z"),
          completedTasks: "保留用户 B 的完成事项",
          problems: "保留用户 B 的问题",
          nextPlan: "保留用户 B 的计划",
          content: "保留用户 B 的旧正文",
          createdAt: new Date("2026-10-19T01:00:00.000Z"),
          updatedAt: new Date("2026-10-19T02:00:00.000Z"),
        },
      ],
    });

    const beforeUpgrade = serializeDiaries(
      await database.prisma.diary.findMany({ orderBy: { id: "asc" } }),
    );

    await runMigrationDeploy(database.databaseUrl);

    const afterUpgrade = serializeDiaries(
      await database.prisma.diary.findMany({ orderBy: { id: "asc" } }),
    );
    assert.deepEqual(afterUpgrade, beforeUpgrade);

    await database.prisma.project.createMany({
      data: [
        {
          id: "project-a",
          userId: "stage2-user-a",
          name: "允许重名项目",
          description: "用户 A 项目",
        },
        {
          id: "project-b",
          userId: "stage2-user-b",
          name: "允许重名项目",
          description: "用户 B 项目",
        },
      ],
    });

    const sameEntryDate = new Date("2026-10-20T00:00:00.000Z");
    await database.prisma.projectDiary.createMany({
      data: [
        {
          id: "project-diary-a-1",
          userId: "stage2-user-a",
          projectId: "project-a",
          title: "同日第一篇",
          entryDate: sameEntryDate,
          completedTasks: "完成第一项实验",
          problems: "第一项问题",
          nextPlan: "第一项计划",
          createdAt: new Date("2026-10-20T01:00:00.000Z"),
          updatedAt: new Date("2026-10-20T01:00:00.000Z"),
        },
        {
          id: "project-diary-a-2",
          userId: "stage2-user-a",
          projectId: "project-a",
          title: "同日第二篇",
          entryDate: sameEntryDate,
          completedTasks: "完成第二项实验",
          problems: "第二项问题",
          nextPlan: "第二项计划",
          createdAt: new Date("2026-10-20T02:00:00.000Z"),
          updatedAt: new Date("2026-10-20T02:00:00.000Z"),
        },
        {
          id: "project-diary-b-1",
          userId: "stage2-user-b",
          projectId: "project-b",
          title: "用户 B 私有日志",
          entryDate: sameEntryDate,
          completedTasks: "用户 B 私有完成事项",
          problems: "用户 B 私有问题",
          nextPlan: "用户 B 私有计划",
        },
      ],
    });

    const userADiaries = await database.prisma.projectDiary.findMany({
      where: { userId: "stage2-user-a", projectId: "project-a" },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    });
    assert.deepEqual(
      userADiaries.map((diary) => diary.id),
      ["project-diary-a-2", "project-diary-a-1"],
    );
    assert.ok(userADiaries.every((diary) => diary.projectId === "project-a"));

    assert.equal(
      await database.prisma.projectDiary.count({ where: { userId: "stage2-user-a" } }),
      2,
    );
    assert.equal(
      await database.prisma.projectDiary.updateMany({
        where: { id: "project-diary-b-1", userId: "stage2-user-a" },
        data: { title: "不应更新" },
      }).then((result) => result.count),
      0,
    );

    await assert.rejects(
      database.prisma.projectDiary.create({
        data: {
          id: "cross-user-project-diary",
          userId: "stage2-user-a",
          projectId: "project-b",
          title: "非法跨用户日志",
          entryDate: sameEntryDate,
          completedTasks: "不应写入",
          problems: "不应写入",
          nextPlan: "不应写入",
        },
      }),
      (error) => error?.code === "P2003",
    );

    const beforeArchiveCount = await database.prisma.projectDiary.count({
      where: { projectId: "project-a" },
    });
    await database.prisma.project.update({
      where: { id: "project-a" },
      data: { archivedAt: new Date("2026-10-20T03:00:00.000Z") },
    });
    assert.equal(
      await database.prisma.projectDiary.count({ where: { projectId: "project-a" } }),
      beforeArchiveCount,
    );

    await assert.rejects(
      database.prisma.diary.create({
        data: {
          id: "duplicate-legacy-date",
          userId: "stage2-user-a",
          date: new Date("2026-10-18T00:00:00.000Z"),
          completedTasks: "不应写入",
          problems: "不应写入",
          nextPlan: "不应写入",
          content: "不应写入",
        },
      }),
      (error) => error?.code === "P2002",
    );
    assert.deepEqual(
      serializeDiaries(await database.prisma.diary.findMany({ orderBy: { id: "asc" } })),
      beforeUpgrade,
    );
  } finally {
    await rm(initialBundle.root, { recursive: true, force: true });
    await database.cleanup();
  }
});
