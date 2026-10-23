import { getProjectDiaries, ProjectDiaryError, saveProjectDiary } from "@/features/project/project-diary-service";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[id]/diaries">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  const search = new URL(request.url).searchParams;
  try {
    return Response.json(await getProjectDiaries(user.id, id, { date: search.get("date") ?? undefined, q: search.get("q") ?? undefined, page: search.get("page") ?? undefined }));
  } catch (error) {
    return Response.json({ message: error instanceof ProjectDiaryError ? error.message : "读取项目日志失败" }, { status: error instanceof ProjectDiaryError ? error.status : 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[id]/diaries">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  try {
    const diary = await saveProjectDiary(user.id, id, user.timeZone, await request.json());
    return Response.json({ diary }, { status: 201 });
  } catch (error) {
    const status = error instanceof ProjectDiaryError ? error.status : error instanceof SyntaxError ? 400 : 500;
    return Response.json({ message: error instanceof ProjectDiaryError ? error.message : status === 400 ? "请求格式不正确" : "保存项目日志失败" }, { status });
  }
}
