import { getProjectDiaryById, ProjectDiaryError, saveProjectDiary } from "@/features/project/project-diary-service";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(_request: Request, { params }: RouteContext<"/api/projects/[id]/diaries/[diaryId]">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });
  const { id, diaryId } = await params;
  try {
    return Response.json({ diary: await getProjectDiaryById(user.id, id, diaryId) });
  } catch (error) {
    return Response.json({ message: error instanceof ProjectDiaryError ? error.message : "读取项目日志失败" }, { status: error instanceof ProjectDiaryError ? error.status : 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/projects/[id]/diaries/[diaryId]">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });
  const { id, diaryId } = await params;
  try {
    return Response.json({ diary: await saveProjectDiary(user.id, id, user.timeZone, await request.json(), diaryId) });
  } catch (error) {
    const status = error instanceof ProjectDiaryError ? error.status : error instanceof SyntaxError ? 400 : 500;
    return Response.json({ message: error instanceof ProjectDiaryError ? error.message : status === 400 ? "请求格式不正确" : "保存项目日志失败" }, { status });
  }
}
