import { createProject, getProjects, ProjectInputError } from "@/features/project/project-service";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });
  const archived = new URL(request.url).searchParams.get("archived");
  if (archived !== null && archived !== "true" && archived !== "false") {
    return Response.json({ message: "归档筛选参数不正确" }, { status: 400 });
  }
  try {
    return Response.json({ projects: await getProjects(user.id, archived === "true") });
  } catch {
    return Response.json({ message: "读取项目失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ message: "请求格式不正确" }, { status: 400 });
  }
  try {
    return Response.json({ project: await createProject(user.id, input) }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectInputError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    return Response.json({ message: "创建项目失败" }, { status: 500 });
  }
}
