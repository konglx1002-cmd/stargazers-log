import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

import { createPostgresTestDatabase } from "./postgres-test-database.mjs";

const baseUrl = "http://127.0.0.1:3105";

async function waitForServer(server, getOutput) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next.js exited.\n${getOutput()}`);
    try {
      if ((await fetch(`${baseUrl}/api/auth/get-session`)).ok) return;
    } catch {
      // The local test server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Timed out waiting for Next.js.\n${getOutput()}`);
}

async function register(name, email) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ name, email, password: "test-password" }),
  });
  assert.equal(response.status, 200, await response.text());
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  const session = await fetch(`${baseUrl}/api/auth/get-session`, {
    headers: { Cookie: cookie },
  }).then((result) => result.json());
  return { cookie, user: session.user };
}

function request(path, cookie, method = "GET", body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
}

async function jsonRequest(path, cookie, method, body, expectedStatus = 200) {
  const response = await request(path, cookie, method, body);
  const result = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(result));
  return result;
}

test("manages projects with session ownership, validation and lossless archiving", { timeout: 180_000 }, async () => {
  const database = await createPostgresTestDatabase("project_api_test");
  let server;
  let output = "";
  try {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3105"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: database.databaseUrl,
        DIRECT_URL: database.databaseUrl,
        BETTER_AUTH_SECRET: "project-api-test-secret-at-least-32-characters",
        BETTER_AUTH_URL: baseUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (chunk) => { output += chunk.toString(); });
    server.stderr.on("data", (chunk) => { output += chunk.toString(); });
    await waitForServer(server, () => output);

    for (const [path, method, body] of [
      ["/api/projects", "GET"],
      ["/api/projects", "POST", { name: "匿名项目" }],
      ["/api/projects/missing", "GET"],
      ["/api/projects/missing", "PATCH", { name: "匿名修改" }],
    ]) {
      assert.equal((await request(path, undefined, method, body)).status, 401);
    }
    for (const path of ["/projects", "/projects/new", "/projects/missing", "/projects/missing/edit"]) {
      const response = await request(path);
      assert.equal(response.status, 307);
      assert.equal(new URL(response.headers.get("location"), baseUrl).pathname, "/login");
    }

    const a = await register("项目用户 A", "project-a@example.com");
    const b = await register("项目用户 B", "project-b@example.com");
    assert.deepEqual((await jsonRequest("/api/projects", a.cookie)).projects, []);
    const { project } = await jsonRequest("/api/projects", a.cookie, "POST", {
      name: "  同名科研项目  ", description: "  A 的描述  ",
    }, 201);
    assert.equal(project.name, "同名科研项目");
    assert.equal(project.description, "A 的描述");
    assert.equal(project.status, "ACTIVE");
    assert.equal(project.archivedAt, null);
    assert.equal("userId" in project, false);
    assert.ok(Number.isFinite(Date.parse(project.createdAt)));
    assert.ok(Number.isFinite(Date.parse(project.updatedAt)));
    const duplicate = (await jsonRequest("/api/projects", a.cookie, "POST", { name: project.name }, 201)).project;
    assert.notEqual(duplicate.id, project.id);
    const privateProject = (await jsonRequest("/api/projects", b.cookie, "POST", {
      name: "BProjectSecret", description: "B 的私有描述",
    }, 201)).project;
    assert.deepEqual(new Set((await jsonRequest("/api/projects", a.cookie)).projects.map((item) => item.id)), new Set([project.id, duplicate.id]));
    assert.deepEqual((await jsonRequest("/api/projects", b.cookie)).projects.map((item) => item.id), [privateProject.id]);

    const path = `/api/projects/${project.id}`;
    assert.equal((await jsonRequest(path, a.cookie)).project.name, project.name);
    const boundary = await jsonRequest(path, a.cookie, "PATCH", { name: "名".repeat(100), description: "描".repeat(5000) });
    assert.equal(boundary.project.name.length, 100);
    assert.equal(boundary.project.description.length, 5000);
    for (const status of ["PAUSED", "COMPLETED", "ACTIVE"]) {
      const result = await jsonRequest(path, a.cookie, "PATCH", { status });
      assert.equal(result.project.status, status);
    }
    await jsonRequest(path, a.cookie, "PATCH", { name: "项目更新名称", description: "更新后的多行描述\n第二行" });

    for (const value of [null, [], {}, { name: " " }, { name: 123 }, { name: "名".repeat(101) },
      { name: "合法名称", description: null }, { name: "合法名称", description: "描".repeat(5001) },
      { name: "合法名称", userId: b.user.id }, { name: "合法名称", id: "指定主键" },
      { name: "合法名称", status: "ACTIVE" }]) {
      assert.equal((await request("/api/projects", a.cookie, "POST", value)).status, 400);
    }
    for (const value of [null, [], {}, { name: "" }, { name: " " }, { name: "名".repeat(101) },
      { description: 123 }, { description: "描".repeat(5001) }, { status: "active" },
      { status: "toString" }, { status: null }, { archived: "true" }, { archived: null },
      { userId: b.user.id }, { archivedAt: "2026-01-01" }, { projectDiaries: { deleteMany: {} } }]) {
      assert.equal((await request(path, a.cookie, "PATCH", value)).status, 400);
    }
    for (const [url, method] of [["/api/projects", "POST"], [path, "PATCH"]]) {
      assert.equal((await fetch(`${baseUrl}${url}`, {
        method, headers: { Cookie: a.cookie, "Content-Type": "application/json" }, body: "{invalid",
      })).status, 400);
    }
    assert.equal((await request("/api/projects?archived=invalid", a.cookie)).status, 400);

    const privateBefore = await database.prisma.project.findUnique({ where: { id: privateProject.id } });
    for (const id of [privateProject.id, "missing-project"]) {
      const url = `/api/projects/${id}`;
      assert.deepEqual(await jsonRequest(url, a.cookie, "GET", undefined, 404), { message: "项目不存在" });
      for (const input of [{ name: "越权修改" }, { archived: true }, { archived: false }, { status: "COMPLETED" }, {}]) {
        await jsonRequest(url, a.cookie, "PATCH", input, 404);
      }
      for (const pagePath of [`/projects/${id}`, `/projects/${id}/edit`]) {
        const response = await request(pagePath, a.cookie);
        assert.equal(response.status, 404);
        assert.doesNotMatch(await response.text(), /BProjectSecret|B 的私有描述/);
      }
    }
    assert.deepEqual(await database.prisma.project.findUnique({ where: { id: privateProject.id } }), privateBefore);
    assert.equal((await request(path, a.cookie, "DELETE")).status, 405);

    const projectDiary = await database.prisma.projectDiary.create({ data: {
      userId: a.user.id, projectId: project.id, title: "归档前的项目日志",
      entryDate: new Date("2026-10-01T00:00:00.000Z"),
      completedTasks: "完整保留完成事项", problems: "完整保留问题", nextPlan: "完整保留计划",
    } });
    const diaryInput = { completedTasks: "独立的日常日志", problems: "旧功能问题", nextPlan: "旧功能计划" };
    const dailyBefore = (await jsonRequest("/api/diary/today", a.cookie, "PUT", diaryInput)).diary;
    const archived = (await jsonRequest(path, a.cookie, "PATCH", { archived: true })).project;
    assert.ok(Number.isFinite(Date.parse(archived.archivedAt)));
    assert.equal((await jsonRequest(path, a.cookie)).project.id, project.id);
    assert.deepEqual((await jsonRequest("/api/projects", a.cookie)).projects.map((item) => item.id), [duplicate.id]);
    assert.deepEqual((await jsonRequest("/api/projects?archived=true", a.cookie)).projects.map((item) => item.id), [project.id]);
    assert.deepEqual((await jsonRequest("/api/projects?archived=true", b.cookie)).projects, []);
    assert.deepEqual(await database.prisma.projectDiary.findUnique({ where: { id: projectDiary.id } }), projectDiary);
    assert.deepEqual((await jsonRequest("/api/diary/today", a.cookie)).diary, dailyBefore);

    const archivedHtml = await request("/projects?archived=true", a.cookie).then((result) => result.text());
    assert.match(archivedHtml, /项目更新名称/);
    const defaultHtml = await request("/projects", a.cookie).then((result) => result.text());
    assert.doesNotMatch(defaultHtml, /项目更新名称|BProjectSecret/);
    const detailHtml = await request(`/projects/${project.id}`, a.cookie).then((result) => result.text());
    assert.match(detailHtml, /恢复归档/);
    assert.match(detailHtml, /已归档/);
    assert.match(detailHtml, /更新后的多行描述/);
    const restored = (await jsonRequest(path, a.cookie, "PATCH", { archived: false })).project;
    assert.equal(restored.archivedAt, null);
    assert.equal((await jsonRequest("/api/projects", a.cookie)).projects.length, 2);
    assert.deepEqual((await jsonRequest("/api/projects?archived=true", a.cookie)).projects, []);
    assert.deepEqual(await database.prisma.projectDiary.findUnique({ where: { id: projectDiary.id } }), projectDiary);

    for (const [url, text] of [
      ["/projects", /项目更新名称/], ["/projects/new", /创建科研项目/],
      [`/projects/${project.id}`, /归档项目/], [`/projects/${project.id}/edit`, /项目状态/],
    ]) {
      const response = await request(url, a.cookie);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, text);
      assert.match(html, /href="\/projects"/);
      assert.doesNotMatch(html, /BProjectSecret|B 的私有描述/);
    }
    const dailyAfter = (await jsonRequest("/api/diary/today", a.cookie, "PUT", { ...diaryInput, nextPlan: "日常日志仍可编辑" })).diary;
    assert.equal(dailyAfter.id, dailyBefore.id);
    assert.equal(await database.prisma.diary.count({ where: { userId: a.user.id } }), 1);
  } finally {
    if (server && server.exitCode === null) {
      server.kill();
      await Promise.race([once(server, "exit"), new Promise((resolveWait) => setTimeout(resolveWait, 5000))]);
    }
    await database.cleanup();
  }
});
