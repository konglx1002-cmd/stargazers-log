export const PROJECT_NAME_MAX_LENGTH = 100;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 5000;

export const projectStatusLabels = {
  ACTIVE: "进行中",
  PAUSED: "已暂停",
  COMPLETED: "已完成",
} as const;

export type ProjectStatus = keyof typeof projectStatusLabels;

export type ProjectData = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
