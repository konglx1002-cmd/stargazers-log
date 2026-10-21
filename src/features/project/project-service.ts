import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  projectStatusLabels,
  type ProjectStatus,
} from "./types";

export class ProjectInputError extends Error {}

const projectSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

function toProjectData(project: Prisma.ProjectGetPayload<{ select: typeof projectSelect }>) {
  return {
    ...project,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function parseInput(value: unknown, creating: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectInputError("请求格式不正确");
  }
  const input = value as Record<string, unknown>;
  if ("userId" in input) {
    throw new ProjectInputError("不能指定用户身份");
  }
  const allowed = creating ? ["name", "description"] : ["name", "description", "status", "archived"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new ProjectInputError("包含不支持的项目字段");
  }

  const data: { name?: string; description?: string; status?: ProjectStatus; archivedAt?: Date | null } = {};
  if (creating || "name" in input) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      throw new ProjectInputError("项目名称不能为空");
    }
    if (input.name.trim().length > PROJECT_NAME_MAX_LENGTH) {
      throw new ProjectInputError(`项目名称不能超过 ${PROJECT_NAME_MAX_LENGTH} 字`);
    }
    data.name = input.name.trim();
  }
  if ("description" in input) {
    if (typeof input.description !== "string" || input.description.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
      throw new ProjectInputError(`项目描述必须是 ${PROJECT_DESCRIPTION_MAX_LENGTH} 字以内的文本`);
    }
    data.description = input.description.trim();
  }
  if ("status" in input) {
    if (typeof input.status !== "string" || !Object.hasOwn(projectStatusLabels, input.status)) {
      throw new ProjectInputError("项目状态不正确");
    }
    data.status = input.status as ProjectStatus;
  }
  if ("archived" in input) {
    if (typeof input.archived !== "boolean") {
      throw new ProjectInputError("归档状态必须是布尔值");
    }
    data.archivedAt = input.archived ? new Date() : null;
  }
  if (!Object.keys(data).length) {
    throw new ProjectInputError("请提供要更新的项目字段");
  }
  return data;
}

export async function getProjects(userId: string, archived = false) {
  const projects = await prisma.project.findMany({
    where: { userId, archivedAt: archived ? { not: null } : null },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: projectSelect,
  });
  return projects.map(toProjectData);
}

export async function getProjectById(userId: string, id: string) {
  const project = await prisma.project.findFirst({ where: { id, userId }, select: projectSelect });
  return project ? toProjectData(project) : null;
}

export async function createProject(userId: string, value: unknown) {
  const data = parseInput(value, true);
  const project = await prisma.project.create({
    data: { userId, name: data.name!, description: data.description ?? "" },
    select: projectSelect,
  });
  return toProjectData(project);
}

export async function updateProject(userId: string, id: string, value: unknown) {
  // Check ownership before validation so another user's ID behaves like a missing ID.
  if (!(await getProjectById(userId, id))) return null;
  const data = parseInput(value, false);
  try {
    const project = await prisma.project.update({
      where: { userId_id: { userId, id } },
      data,
      select: projectSelect,
    });
    return toProjectData(project);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
    throw error;
  }
}
