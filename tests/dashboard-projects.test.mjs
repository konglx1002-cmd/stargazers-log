import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

import { createPostgresTestDatabase } from "./postgres-test-database.mjs";

const baseUrl = "http://127.0.0.1:3107";

async function request(path, cookie, method = "GET", body) {
  return fetch(`${baseUrl}${path}`, { method, headers: { "Content-Type": "application/json", Origin: baseUrl, ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function register(email) {
  const response = await request("/api/auth/sign-up/email", undefined, "POST", { name: email, email, password: "test-password" });
  assert.equal(response.status, 200, await response.text());
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  const session = await request("/api/auth/get-session", cookie).then((result) => result.json());
  return { cookie, id: session.user.id };
}

async function dashboard(cookie) {
  const response = await request("/", cookie);
  assert.equal(response.status, 200);
  const html = await response.text();
  const section = html.match(/<section aria-label="我的科研项目"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  const clean = section.replace(/<!--.*?-->/gs, "");
  const ids = [...clean.matchAll(/href="\/projects\/([^"/]+)"/g)].map((match) => match[1]).filter((id) => id !== "new");
  return { html, section: clean, ids };
}

test("dashboard limits projects, aggregates counts and stably orders activity within each user", { timeout: 180_000 }, async () => {
  const database = await createPostgresTestDatabase("dashboard_projects_test");
  const { prisma } = database;
  let server;
  let output = "";
  try {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3107"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: database.databaseUrl, DIRECT_URL: database.databaseUrl, BETTER_AUTH_SECRET: "dashboard-project-test-secret-at-least-32-characters", BETTER_AUTH_URL: baseUrl }, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", (chunk) => { output += chunk.toString(); });
    server.stderr.on("data", (chunk) => { output += chunk.toString(); });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) throw new Error(output);
      try { if ((await request("/api/auth/get-session")).ok) { ready = true; break; } } catch { /* Wait for local Next.js. */ }
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
    assert.ok(ready, output);
    const anonymous = await request("/").then((response) => response.text());
    assert.doesNotMatch(anonymous, /aria-label="我的科研项目"/);
    const a = await register("dashboard-a@example.com");
    const b = await register("dashboard-b@example.com");
    const empty = await dashboard(a.cookie);
    assert.match(empty.section, /暂无未归档/);
    assert.match(empty.section, /href="\/projects\/new"/);
    assert.match(empty.html, /还没有记录今天的日志/);
    assert.match(empty.html, /开始你的第一篇科研日志/);

    const createdResponse = await request("/api/projects", a.cookie, "POST", { name: "新建无日志项目" });
    assert.equal(createdResponse.status, 201);
    const { project: created } = await createdResponse.json();
    const first = await dashboard(a.cookie);
    assert.deepEqual(first.ids, [created.id]);
    assert.match(first.section, /新建无日志项目/);
    assert.match(first.section, /进行中/);
    assert.match(first.section, /项目日志：0 篇/);
    assert.match(first.section, /最近日志：暂无日志/);
    assert.match((await dashboard(b.cookie)).section, /暂无未归档/);
    await prisma.project.update({ where: { id: created.id }, data: { createdAt: new Date("1980-01-01T00:00:00Z") } });

    await prisma.project.createMany({ data: [
      { id: "recent-a", userId: a.id, name: "最近日志项目 A", status: "PAUSED", createdAt: new Date("2020-01-01T00:00:00Z") },
      { id: "recent-b", userId: a.id, name: "最近日志项目 B", status: "COMPLETED", createdAt: new Date("2020-01-01T00:00:00Z") },
      { id: "empty-new", userId: a.id, name: "无日志按创建时间领先", createdAt: new Date("2031-01-01T00:00:00Z") },
      { id: "empty-old", userId: a.id, name: "无日志备用项目", createdAt: new Date("2029-01-01T00:00:00Z") },
      { id: "empty-tie-z", userId: a.id, name: "同创建时刻的无日志项目", createdAt: new Date("2029-01-01T00:00:00Z") },
      { id: "old-entry", userId: a.id, name: "有旧日志不能按创建时间领先", createdAt: new Date("2040-01-01T00:00:00Z") },
      { id: "archived", userId: a.id, name: "ArchivedSecret", archivedAt: new Date(), createdAt: new Date("2050-01-01T00:00:00Z") },
      { id: "private-b", userId: b.id, name: "OtherUserProjectSecret", createdAt: new Date("2099-01-01T00:00:00Z") },
    ] });
    await prisma.projectDiary.createMany({ data: [
      ...["2030-01-01", "2030-01-02", "2030-01-02"].map((date) => ({ userId: a.id, projectId: "recent-a", title: "TitleShouldNotBeLoaded", entryDate: new Date(`${date}T00:00:00Z`), completedTasks: "HiddenBodySecret", problems: "", nextPlan: "" })),
      { userId: a.id, projectId: "recent-b", title: "同日另一项目", entryDate: new Date("2030-01-02T00:00:00Z"), completedTasks: "", problems: "", nextPlan: "" },
      { userId: a.id, projectId: "old-entry", title: "旧日志", entryDate: new Date("2000-01-01T00:00:00Z"), completedTasks: "", problems: "", nextPlan: "" },
      { userId: a.id, projectId: "archived", title: "归档最新日志", entryDate: new Date("2099-01-01T00:00:00Z"), completedTasks: "", problems: "", nextPlan: "" },
      { userId: b.id, projectId: "private-b", title: "他人日志", entryDate: new Date("2099-01-01T00:00:00Z"), completedTasks: "", problems: "", nextPlan: "" },
    ] });
    const dailyResponse = await request("/api/diary/today", a.cookie, "PUT", { completedTasks: "DashboardOriginalDiary", problems: "", nextPlan: "" });
    assert.equal(dailyResponse.status, 200);
    const daily = (await dailyResponse.json()).diary;
    const ranked = await dashboard(a.cookie);
    assert.deepEqual(ranked.ids, ["empty-new", "recent-a", "recent-b"]);
    assert.match(ranked.section, /项目日志：3 篇/);
    assert.match(ranked.section, /项目日志：1 篇/);
    assert.match(ranked.section, /dateTime="2030-01-02"/);
    assert.match(ranked.section, /已暂停/);
    assert.match(ranked.section, /已完成/);
    assert.match(ranked.section, /href="\/projects"/);
    assert.doesNotMatch(ranked.html, /ArchivedSecret|OtherUserProjectSecret|HiddenBodySecret|TitleShouldNotBeLoaded|有旧日志不能按创建时间领先/);
    assert.match(ranked.html, /今天已经完成日志/);
    assert.match(ranked.html, /DashboardOriginalDiary/);
    assert.match(ranked.html, new RegExp(`href="/diary/${daily.id}"`));
    // Same activity date: createdAt DESC, then id ASC; repeat reads are stable.
    await prisma.project.update({ where: { id: "recent-b" }, data: { createdAt: new Date("2021-01-01T00:00:00Z") } });
    for (let attempt = 0; attempt < 2; attempt++) assert.deepEqual((await dashboard(a.cookie)).ids, ["empty-new", "recent-b", "recent-a"]);
    await prisma.project.update({ where: { id: "empty-new" }, data: { archivedAt: new Date() } });
    assert.deepEqual((await dashboard(a.cookie)).ids, ["recent-b", "recent-a", "empty-old"]);
    const privateDashboard = await dashboard(b.cookie);
    assert.deepEqual(privateDashboard.ids, ["private-b"]);
    assert.match(privateDashboard.section, /项目日志：1 篇/);
    assert.doesNotMatch(privateDashboard.html, /最近日志项目 A|最近日志项目 B|DashboardOriginalDiary/);
    await prisma.project.updateMany({ where: { userId: a.id }, data: { archivedAt: new Date() } });
    assert.match((await dashboard(a.cookie)).section, /暂无未归档/);
    assert.deepEqual((await dashboard(b.cookie)).ids, ["private-b"]);
    await prisma.project.updateMany({ where: { userId: a.id, id: { in: ["empty-old", "empty-tie-z", created.id] } }, data: { archivedAt: null } });
    for (let attempt = 0; attempt < 2; attempt++) {
      const restored = await dashboard(a.cookie);
      assert.deepEqual(restored.ids, ["empty-old", "empty-tie-z", created.id]);
      assert.equal((restored.section.match(/项目日志：0 篇/g) ?? []).length, 3);
      assert.equal((restored.section.match(/最近日志：暂无日志/g) ?? []).length, 3);
    }
    assert.deepEqual((await request("/api/diary/today", a.cookie).then((response) => response.json())).diary, daily);
  } finally {
    if (server && server.exitCode === null) {
      server.kill();
      await Promise.race([once(server, "exit"), new Promise((resolveWait) => setTimeout(resolveWait, 5000))]);
    }
    await database.cleanup();
  }
});
