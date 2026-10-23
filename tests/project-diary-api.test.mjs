import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

import { createPostgresTestDatabase } from "./postgres-test-database.mjs";
import { isValidEntryDate, validateProjectDiaryFields } from "../src/features/project/project-diary-types.ts";

const baseUrl = "http://127.0.0.1:3106";
const input = { title: "  TitleNeedle  ", entryDate: "2026-10-01", completedTasks: "CompletedNeedle", problems: "ProblemsNeedle", nextPlan: "PlanNeedle" };

function request(path, cookie, method = "GET", body) {
  return fetch(`${baseUrl}${path}`, { method, redirect: "manual", headers: { "Content-Type": "application/json", Origin: baseUrl, ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function json(path, cookie, method = "GET", body, status = 200) {
  const response = await request(path, cookie, method, body);
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  return result;
}
function dateIn(timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
async function register(email, timeZone) {
  const response = await request("/api/auth/sign-up/email", undefined, "POST", { name: email, email, password: "test-password", timeZone });
  assert.equal(response.status, 200, await response.text());
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  const session = await json("/api/auth/get-session", cookie);
  return { cookie, id: session.user.id };
}

test("validates real calendar dates and shared project diary limits", () => {
  for (const date of ["2024-02-29", "2026-10-01", "0001-01-01", "9999-12-31"]) assert.equal(isValidEntryDate(date), true);
  for (const date of ["2025-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "0000-01-01", "2026-1-01", "2026-10-01T00:00:00Z", null]) assert.equal(isValidEntryDate(date), false);
  assert.equal(validateProjectDiaryFields({ ...input, title: "字".repeat(200), completedTasks: "文".repeat(20_000) }), null);
  assert.ok(validateProjectDiaryFields({ title: "字".repeat(201) }));
  for (const field of ["completedTasks", "problems", "nextPlan"]) assert.ok(validateProjectDiaryFields({ [field]: "文".repeat(20_001) }));
});

test("isolates project diaries, permits same-day entries, filters, paginates and serializes archiving", { timeout: 240_000 }, async () => {
  const database = await createPostgresTestDatabase("project_diary_api_test");
  const { prisma } = database;
  let server;
  let output = "";
  try {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3106"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: database.databaseUrl, DIRECT_URL: database.databaseUrl, BETTER_AUTH_SECRET: "project-diary-test-secret-at-least-32-characters", BETTER_AUTH_URL: baseUrl }, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", (chunk) => { output += chunk.toString(); });
    server.stderr.on("data", (chunk) => { output += chunk.toString(); });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) throw new Error(output);
      try { if ((await request("/api/auth/get-session")).ok) { ready = true; break; } } catch { /* Waiting for local Next.js. */ }
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
    assert.ok(ready, output);
    for (const [url, method, body] of [["/api/projects/missing/diaries", "GET"], ["/api/projects/missing/diaries", "POST", input], ["/api/projects/missing/diaries/missing", "GET"], ["/api/projects/missing/diaries/missing", "PATCH", input]]) {
      await json(url, undefined, method, body, 401);
    }
    for (const path of ["/projects/missing/diaries/new", "/projects/missing/diaries/missing", "/projects/missing/diaries/missing/edit"]) assert.equal((await request(path)).status, 307);

    const a = await register("diary-a@example.com", "Pacific/Pago_Pago");
    const b = await register("diary-b@example.com", "Pacific/Kiritimati");
    const project = (await json("/api/projects", a.cookie, "POST", { name: "项目 A" }, 201)).project;
    const otherProject = (await json("/api/projects", a.cookie, "POST", { name: "项目 A2" }, 201)).project;
    const privateProject = (await json("/api/projects", b.cookie, "POST", { name: "项目 B" }, 201)).project;
    const path = `/api/projects/${project.id}/diaries`;
    const otherPath = `/api/projects/${otherProject.id}/diaries`;
    const privatePath = `/api/projects/${privateProject.id}/diaries`;
    const entries = [];
    for (let index = 0; index < 3; index++) entries.push((await json(path, a.cookie, "POST", input, 201)).diary);
    assert.equal(new Set(entries.map((diary) => diary.id)).size, 3);
    assert.ok(entries.every((diary) => diary.title === "TitleNeedle" && diary.entryDate === input.entryDate && !Object.hasOwn(diary, "userId")));
    const other = (await json(otherPath, a.cookie, "POST", { ...input, title: "OtherProjectSecret" }, 201)).diary;
    const privateDiary = (await json(privatePath, b.cookie, "POST", { ...input, title: "OtherUserSecret" }, 201)).diary;
    assert.equal((await json(path, a.cookie)).diaries.length, 3);
    assert.deepEqual((await json(otherPath, a.cookie)).diaries.map((diary) => diary.id), [other.id]);
    // Equal dates and creation instants exercise the stable ID tie breaker.
    await prisma.projectDiary.updateMany({ where: { userId: a.id, projectId: project.id }, data: { createdAt: new Date("2026-10-02T00:00:00Z") } });
    assert.deepEqual((await json(path, a.cookie)).diaries.map((diary) => diary.id), entries.map((diary) => diary.id).sort());
    for (const keyword of ["titleneedle", "CompletedNeedle", "ProblemsNeedle", "PlanNeedle"]) {
      assert.equal((await json(`${path}?q=${keyword}&date=2026-10-01`, a.cookie)).diaries.length, 3);
    }
    assert.deepEqual((await json(`${path}?date=2026-10-02`, a.cookie)).diaries, []);
    for (const secret of ["OtherProjectSecret", "OtherUserSecret"]) assert.deepEqual((await json(`${path}?q=${secret}`, a.cookie)).diaries, []);
    const prior = await prisma.projectDiary.findMany({ where: { projectId: project.id }, orderBy: { id: "asc" } });
    const editPath = `${path}/${entries[0].id}`;
    const edited = (await json(editPath, a.cookie, "PATCH", { title: " 编辑后标题 ", entryDate: "2024-02-29", completedTasks: "编辑完成", problems: "编辑问题", nextPlan: "编辑计划" })).diary;
    assert.equal(edited.id, entries[0].id);
    assert.equal(edited.title, "编辑后标题");
    assert.equal(edited.entryDate, "2024-02-29");
    assert.equal((await json(editPath, a.cookie)).diary.completedTasks, "编辑完成");
    assert.deepEqual(await prisma.projectDiary.findMany({ where: { projectId: project.id, id: { not: entries[0].id } }, orderBy: { id: "asc" } }), prior.filter((diary) => diary.id !== entries[0].id));
    assert.equal((await json(`${path}?date=2024-02-29&q=编辑计划`, a.cookie)).diaries.length, 1);

    for (const [url, cookie] of [[privatePath, a.cookie], [path, b.cookie], ["/api/projects/missing/diaries", a.cookie]]) {
      await json(url, cookie, "GET", undefined, 404);
      await json(url, cookie, "POST", input, 404);
    }
    for (const url of [`${path}/${privateDiary.id}`, `${path}/${other.id}`, `${otherPath}/${entries[0].id}`, `${privatePath}/${privateDiary.id}`, `${path}/missing`]) {
      await json(url, a.cookie, "GET", undefined, 404);
      await json(url, a.cookie, "PATCH", { title: "越权修改" }, 404);
    }
    for (const body of [null, [], {}, { ...input, title: " " }, { ...input, title: "字".repeat(201) }, { ...input, title: null }, { ...input, entryDate: "2026-02-30" }, { ...input, entryDate: "2026-1-01" }, { ...input, entryDate: null }, { ...input, userId: b.id }, { ...input, projectId: otherProject.id }, { ...input, id: "spoof" }, { ...input, completedTasks: 1 }, { ...input, problems: "文".repeat(20_001) }, { ...input, nextPlan: null }]) await json(path, a.cookie, "POST", body, 400);
    for (const body of [null, [], {}, { title: " " }, { entryDate: "2025-02-29" }, { completedTasks: null }, { nextPlan: "文".repeat(20_001) }, { userId: b.id }, { projectId: otherProject.id }]) await json(editPath, a.cookie, "PATCH", body, 400);
    for (const query of ["date=2026-02-30", "page=0", "page=-1", "page=1.5", "page=1001", `q=${"a".repeat(201)}`]) await json(`${path}?${query}`, a.cookie, "GET", undefined, 400);
    assert.equal((await fetch(`${baseUrl}${path}`, { method: "POST", headers: { Cookie: a.cookie, "Content-Type": "application/json" }, body: "{bad" })).status, 400);
    await json(editPath, a.cookie, "PATCH", { title: "字".repeat(200), completedTasks: "文".repeat(20_000) });

    const { entryDate: omitted, ...noDate } = input;
    assert.ok(omitted);
    for (const [user, url, timeZone] of [[a, path, "Pacific/Pago_Pago"], [b, privatePath, "Pacific/Kiritimati"]]) {
      const before = dateIn(timeZone);
      const created = (await json(url, user.cookie, "POST", noDate, 201)).diary;
      assert.ok([before, dateIn(timeZone)].includes(created.entryDate));
    }
    await prisma.user.update({ where: { id: a.id }, data: { timeZone: "Mars/Invalid" } });
    const beforeFallback = dateIn("Asia/Shanghai");
    const fallback = (await json(path, a.cookie, "POST", noDate, 201)).diary;
    assert.ok([beforeFallback, dateIn("Asia/Shanghai")].includes(fallback.entryDate));
    await prisma.user.update({ where: { id: a.id }, data: { timeZone: "Pacific/Pago_Pago" } });

    await prisma.projectDiary.createMany({ data: Array.from({ length: 21 }, (_, index) => ({ id: `pagination-${String(index).padStart(2, "0")}`, userId: a.id, projectId: project.id, title: "PaginationBatch", entryDate: new Date("2026-11-01T00:00:00Z"), createdAt: new Date("2026-11-02T00:00:00Z"), completedTasks: "", problems: "", nextPlan: "" })) });
    const page1 = await json(`${path}?q=PaginationBatch`, a.cookie);
    const page2 = await json(`${path}?q=PaginationBatch&page=2`, a.cookie);
    assert.equal(page1.diaries.length, 20);
    assert.equal(page1.hasNext, true);
    assert.equal(page2.diaries.length, 1);
    assert.equal(page2.hasNext, false);
    assert.equal(new Set([...page1.diaries, ...page2.diaries].map((diary) => diary.id)).size, 21);
    assert.deepEqual([...page1.diaries, ...page2.diaries].map((diary) => diary.id), Array.from({ length: 21 }, (_, index) => `pagination-${String(index).padStart(2, "0")}`));

    for (const status of ["ACTIVE", "PAUSED", "COMPLETED"]) {
      await json(`/api/projects/${project.id}`, a.cookie, "PATCH", { status });
      const diary = (await json(path, a.cookie, "POST", input, 201)).diary;
      await json(`${path}/${diary.id}`, a.cookie, "PATCH", { title: `状态 ${status}` });
    }
    const beforeArchive = await prisma.projectDiary.findMany({ where: { projectId: project.id }, orderBy: { id: "asc" } });
    await json(`/api/projects/${project.id}`, a.cookie, "PATCH", { archived: true });
    await json(path, a.cookie, "POST", input, 409);
    await json(editPath, a.cookie, "PATCH", { title: "禁止编辑" }, 409);
    await json(editPath, a.cookie);
    await json(path, a.cookie);
    assert.deepEqual(await prisma.projectDiary.findMany({ where: { projectId: project.id }, orderBy: { id: "asc" } }), beforeArchive);
    for (const suffix of ["", "/diaries/new", `/diaries/${entries[0].id}`, `/diaries/${entries[0].id}/edit`]) {
      const response = await request(`/projects/${project.id}${suffix}`, a.cookie);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /已归档/);
      if (!suffix) assert.doesNotMatch(html, new RegExp(`href="/projects/${project.id}/diaries/new"`));
      if (suffix) assert.doesNotMatch(html, /<fieldset/);
    }
    await json(`/api/projects/${project.id}`, a.cookie, "PATCH", { archived: false });
    assert.deepEqual(await prisma.projectDiary.findMany({ where: { projectId: project.id }, orderBy: { id: "asc" } }), beforeArchive);
    await json(path, a.cookie, "POST", input, 201);
    await json(editPath, a.cookie, "PATCH", { title: "恢复后可编辑" });

    // Hold an uncommitted archive UPDATE. The HTTP writer must wait on the row,
    // re-read archivedAt after COMMIT, and reject both create and edit.
    for (const editing of [false, true]) {
      await json(`/api/projects/${project.id}`, a.cookie, "PATCH", { archived: false });
      const before = await prisma.projectDiary.findMany({ where: { projectId: project.id }, orderBy: { id: "asc" } });
      let pending;
      await prisma.$transaction(async (tx) => {
        await tx.project.update({ where: { id: project.id }, data: { archivedAt: new Date() } });
        pending = request(editing ? editPath : path, a.cookie, editing ? "PATCH" : "POST", input);
        let blocked = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const rows = await prisma.$queryRaw`SELECT pid FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%' AND pid <> pg_backend_pid()`;
          if (rows.length) { blocked = true; break; }
          await new Promise((resolveWait) => setTimeout(resolveWait, 50));
        }
        assert.ok(blocked, "ProjectDiary write must wait for the archive row lock");
      }, { timeout: 15_000 });
      assert.equal((await pending).status, 409);
      assert.deepEqual(await prisma.projectDiary.findMany({ where: { projectId: project.id }, orderBy: { id: "asc" } }), before);
    }
    await json(`/api/projects/${project.id}`, a.cookie, "PATCH", { archived: false });
    for (const [url, pattern] of [[`/projects/${project.id}`, /新建日志/], [`/projects/${project.id}/diaries/new`, /日志标题/], [`/projects/${project.id}/diaries/${entries[0].id}?saved=1`, /日志保存成功/], [`/projects/${project.id}/diaries/${entries[0].id}/edit`, /保存修改/]]) {
      const response = await request(url, a.cookie);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, pattern);
      assert.doesNotMatch(html, /OtherUserSecret|OtherProjectSecret/);
    }
    const noResults = await request(`/projects/${project.id}?q=missing-keyword`, a.cookie).then((response) => response.text());
    assert.match(noResults, /没有符合条件/);
    const filteredHtml = await request(`/projects/${project.id}?q=PaginationBatch&date=2026-11-01`, a.cookie).then((response) => response.text());
    assert.match(filteredHtml, /下一页/);
    assert.match(filteredHtml, /page=2/);
    for (const url of [`/projects/${project.id}/diaries/${other.id}`, `/projects/${project.id}/diaries/${privateDiary.id}/edit`, `/projects/${privateProject.id}/diaries/new`, `/projects/${project.id}/diaries/missing`]) assert.equal((await request(url, a.cookie)).status, 404);
    const dailyInput = { completedTasks: "旧日常日志", problems: "旧问题", nextPlan: "旧计划" };
    const daily1 = (await json("/api/diary/today", a.cookie, "PUT", dailyInput)).diary;
    const daily2 = (await json("/api/diary/today", a.cookie, "PUT", dailyInput)).diary;
    assert.equal(daily1.id, daily2.id);
    assert.equal(await prisma.diary.count({ where: { userId: a.id } }), 1);
    await assert.rejects(prisma.diary.create({ data: { userId: a.id, date: new Date(`${daily1.date}T00:00:00Z`), ...dailyInput, content: "" } }), (error) => error.code === "P2002");
  } finally {
    if (server && server.exitCode === null) {
      server.kill();
      await Promise.race([once(server, "exit"), new Promise((resolveWait) => setTimeout(resolveWait, 5000))]);
    }
    await database.cleanup();
  }
});
