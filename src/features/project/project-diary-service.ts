import "server-only";

import type { ProjectDiary } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { DEFAULT_TIME_ZONE, getTodayDateKey, isValidTimeZone } from "@/lib/time-zone";

import { getProjectById } from "./project-service";
import {
  isValidEntryDate,
  PROJECT_DIARY_MAX_PAGE,
  PROJECT_DIARY_PAGE_SIZE,
  validateProjectDiaryFields,
  type ProjectDiaryInput,
} from "./project-diary-types";

export class ProjectDiaryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function getProjectDiaryDefaultDate(timeZone: string) {
  return getTodayDateKey(isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE);
}

function toData(diary: ProjectDiary) {
  return {
    id: diary.id,
    projectId: diary.projectId,
    title: diary.title,
    entryDate: diary.entryDate.toISOString().slice(0, 10),
    completedTasks: diary.completedTasks,
    problems: diary.problems,
    nextPlan: diary.nextPlan,
    createdAt: diary.createdAt.toISOString(),
    updatedAt: diary.updatedAt.toISOString(),
  };
}

function parseInput(value: unknown, creating: boolean, timeZone: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProjectDiaryError(400, "日志格式不正确");
  const input = value as Record<string, unknown>;
  const fields = ["title", "entryDate", "completedTasks", "problems", "nextPlan"] as const;
  if (Object.keys(input).some((key) => !fields.some((field) => field === key))) {
    throw new ProjectDiaryError(400, "不能指定身份、所属项目或其他日志字段");
  }
  for (const field of fields) {
    if ((creating && field !== "entryDate") || field in input) {
      if (typeof input[field] !== "string") throw new ProjectDiaryError(400, "标题、日期和正文必须为文本");
    }
  }
  if (!creating && !Object.keys(input).length) throw new ProjectDiaryError(400, "请提供要更新的日志字段");
  const data = { ...input } as Partial<ProjectDiaryInput>;
  if (creating && data.entryDate === undefined) data.entryDate = getProjectDiaryDefaultDate(timeZone);
  const message = validateProjectDiaryFields(data);
  if (message) throw new ProjectDiaryError(400, message);
  if (data.title !== undefined) data.title = data.title.trim();
  return { ...data, ...(data.entryDate === undefined ? {} : { entryDate: new Date(`${data.entryDate}T00:00:00.000Z`) }) };
}

export async function getProjectDiaries(userId: string, projectId: string, query: { date?: string; q?: string; page?: string } = {}) {
  if (!(await getProjectById(userId, projectId))) throw new ProjectDiaryError(404, "项目或日志不存在");
  const keyword = (query.q ?? "").trim();
  if (keyword.length > 200) throw new ProjectDiaryError(400, "搜索关键词不能超过 200 字");
  if (query.date && !isValidEntryDate(query.date)) throw new ProjectDiaryError(400, "日期筛选不正确");
  const page = query.page === undefined || query.page === "" ? 1 : Number(query.page);
  if (!Number.isInteger(page) || page < 1 || page > PROJECT_DIARY_MAX_PAGE || (query.page && !/^\d+$/.test(query.page))) {
    throw new ProjectDiaryError(400, `页码必须在 1 到 ${PROJECT_DIARY_MAX_PAGE} 之间`);
  }
  const diaries = await prisma.projectDiary.findMany({
    where: {
      userId, projectId,
      ...(query.date ? { entryDate: new Date(`${query.date}T00:00:00.000Z`) } : {}),
      ...(keyword ? { OR: ["title", "completedTasks", "problems", "nextPlan"].map((field) => ({ [field]: { contains: keyword, mode: "insensitive" as const } })) } : {}),
    },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * PROJECT_DIARY_PAGE_SIZE,
    take: PROJECT_DIARY_PAGE_SIZE + 1,
  });
  return { diaries: diaries.slice(0, PROJECT_DIARY_PAGE_SIZE).map(toData), page, pageSize: PROJECT_DIARY_PAGE_SIZE, hasNext: diaries.length > PROJECT_DIARY_PAGE_SIZE && page < PROJECT_DIARY_MAX_PAGE };
}

export async function getProjectDiaryById(userId: string, projectId: string, id: string) {
  if (!(await getProjectById(userId, projectId))) throw new ProjectDiaryError(404, "项目或日志不存在");
  const diary = await prisma.projectDiary.findFirst({ where: { userId, projectId, id } });
  if (!diary) throw new ProjectDiaryError(404, "项目或日志不存在");
  return toData(diary);
}

export async function saveProjectDiary(userId: string, projectId: string, timeZone: string, value: unknown, id?: string) {
  return prisma.$transaction(async (tx) => {
    // A concurrent Project UPDATE (including archive/restore) takes the same row lock.
    const projects = await tx.$queryRaw<{ archivedAt: Date | null }[]>`
      SELECT "archivedAt" FROM "Project" WHERE "userId" = ${userId} AND "id" = ${projectId} FOR UPDATE
    `;
    if (!projects[0]) throw new ProjectDiaryError(404, "项目或日志不存在");
    if (id && !(await tx.projectDiary.findFirst({ where: { id, userId, projectId }, select: { id: true } }))) {
      throw new ProjectDiaryError(404, "项目或日志不存在");
    }
    if (projects[0].archivedAt) throw new ProjectDiaryError(409, "项目已归档，请先恢复归档后再新增或编辑日志");
    const data = parseInput(value, !id, timeZone);
    const diary = id
      ? await tx.projectDiary.update({ where: { id, userId, projectId }, data })
      : await tx.projectDiary.create({ data: { ...data, userId, projectId, title: data.title!, entryDate: data.entryDate as Date, completedTasks: data.completedTasks!, problems: data.problems!, nextPlan: data.nextPlan! } });
    return toData(diary);
  }, { timeout: 10_000 });
}
