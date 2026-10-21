import { getProjectById, updateProject, ProjectInputError } from "@/features/project/project-service";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(_request: Request, { params }: RouteContext<"/api/projects/[id]">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  try {
    const project = await getProjectById(user.id, id);
    return project
      ? Response.json({ project })
      : Response.json({ message: "项目不存在" }, { status: 404 });
  } catch {
    return Response.json({ message: "读取项目失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/projects/[id]">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ message: "请求格式不正确" }, { status: 400 });
  }
  try {
    const project = await updateProject(user.id, id, input);
    return project
      ? Response.json({ project })
      : Response.json({ message: "项目不存在" }, { status: 404 });
  } catch (error) {
    if (error instanceof ProjectInputError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    return Response.json({ message: "保存项目失败" }, { status: 500 });
  }
}
