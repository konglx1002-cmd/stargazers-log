export const PROJECT_DIARY_TITLE_MAX_LENGTH = 200;
export const PROJECT_DIARY_BODY_MAX_LENGTH = 20_000;
export const PROJECT_DIARY_PAGE_SIZE = 20;
export const PROJECT_DIARY_MAX_PAGE = 1000;

export type ProjectDiaryInput = {
  title: string;
  entryDate: string;
  completedTasks: string;
  problems: string;
  nextPlan: string;
};

export type ProjectDiaryData = ProjectDiaryInput & {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export function isValidEntryDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateProjectDiaryFields(input: Partial<ProjectDiaryInput>) {
  if (input.title !== undefined && (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > PROJECT_DIARY_TITLE_MAX_LENGTH)) {
    return `标题不能为空且不能超过 ${PROJECT_DIARY_TITLE_MAX_LENGTH} 字`;
  }
  if (input.entryDate !== undefined && !isValidEntryDate(input.entryDate)) return "请输入合法的 YYYY-MM-DD 日期";
  for (const field of ["completedTasks", "problems", "nextPlan"] as const) {
    if (input[field] !== undefined && (typeof input[field] !== "string" || input[field].length > PROJECT_DIARY_BODY_MAX_LENGTH)) {
      return `正文必须是 ${PROJECT_DIARY_BODY_MAX_LENGTH} 字以内的文本`;
    }
  }
  return null;
}
