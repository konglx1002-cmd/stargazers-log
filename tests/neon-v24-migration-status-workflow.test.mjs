import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workflowUrl = new URL(
  "../.github/workflows/neon-v24-migration-status.yml",
  import.meta.url,
);
const workflow = await readFile(workflowUrl, "utf8");
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

test("Neon v2.4 status workflow is manual, pinned, and test-only", () => {
  assert.match(workflow, /^name: Neon v2\.4 Test — Status Only$/m);
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(workflow, /^  (push|pull_request|schedule):/m);
  assert.match(workflow, /environment: neon-v24-migration-test-status/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /timeout-minutes: 10/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /CONFIRMED_ACTIVE_IN_NEON_CONSOLE/);
  const actionReferences = [...workflow.matchAll(/^\s+uses:\s+\S+@([^\s#]+)/gm)].map(
    (match) => match[1],
  );
  assert.ok(actionReferences.length > 0);
  assert.ok(actionReferences.every((reference) => /^[0-9a-f]{40}$/.test(reference)));
});

test("workflow checks out and verifies the audited v2.4 artifacts", () => {
  assert.match(workflow, /4e35966d5f4f2c47882afbc55ccecd191d871c0b/);
  assert.match(workflow, /ep-silent-term-b37hgmn5/);
  assert.match(workflow, /0abd0cd9d72881641951106b14a36c58a236730516622872cc95154a6c8a2893/);
  assert.match(workflow, /20261020152832_add_project_diaries/);
  assert.match(workflow, /20261014000000_postgresql_init/);
  assert.match(workflow, /6\.19\.3/);
  assert.match(workflow, /vars\.NEON_V24_TEST_ENDPOINT_ID/);
  assert.match(workflow, /vars\.NEON_V24_TEST_DATABASE/);
  assert.match(workflow, /vars\.NEON_V24_TEST_ROLE/);
});

test("database secret is narrowly scoped and only status is allowed", () => {
  assert.equal(
    (workflow.match(/secrets\.NEON_V24_TEST_DIRECT_URL/g) ?? []).length,
    2,
  );
  assert.ok(
    workflow.indexOf("Verify Prisma CLI and Linux engines") <
      workflow.indexOf("secrets.NEON_V24_TEST_DIRECT_URL"),
  );
  assert.doesNotMatch(workflow, /secrets\.(DATABASE_URL|DIRECT_URL)/);
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.doesNotMatch(
    workflow,
    /prisma\s+(migrate\s+(deploy|dev|reset|resolve)|db\s+push)/i,
  );
  assert.equal((workflow.match(/["']migrate["'],\s*["']status["']/g) ?? []).length, 1);
  assert.match(workflow, /P1001/);
  assert.match(workflow, /Unknown Prisma migrate status result/);
  assert.doesNotMatch(workflow, /console\.(log|error)\(output/);
});

test("Prisma lifecycle scripts and Linux engines are verified before secrets", () => {
  assert.match(workflow, /pnpm install --frozen-lockfile\s*$/m);
  assert.doesNotMatch(workflow, /--ignore-scripts/);
  assert.match(workflow, /127\.0\.0\.1:1\/prisma_engine_check/);
  assert.match(workflow, /pnpm exec prisma version --json/);
  assert.match(workflow, /query-engine-\(node-api\)/);
  assert.match(workflow, /spawnSync\(schemaEngine, \["--version"\]/);
  assert.match(workflow, /pnpm exec prisma validate --schema prisma\/schema\.prisma/);
  assert.ok(
    workflow.indexOf("Verify Prisma CLI and Linux engines") <
      workflow.indexOf("Validate the test Direct URL identity"),
  );
});

test(
  "installed Prisma CLI and engines execute without database credentials",
  {
    skip: !existsSync(
      process.env.PRISMA_CLI_PATH ??
        resolve(repositoryRoot, "node_modules/prisma/build/index.js"),
    ),
  },
  () => {
    const prismaCli =
      process.env.PRISMA_CLI_PATH ??
      resolve(repositoryRoot, "node_modules/prisma/build/index.js");
    const placeholderUrl =
      "postgresql://prisma_engine_check:unused@127.0.0.1:1/prisma_engine_check?schema=public&connect_timeout=1";
    const environment = {
      ...process.env,
      DATABASE_URL: placeholderUrl,
      DIRECT_URL: placeholderUrl,
    };
    const versionResult = spawnSync(
      process.execPath,
      [prismaCli, "version", "--json"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: environment,
        timeout: 20_000,
      },
    );
    assert.equal(versionResult.status, 0, versionResult.stderr);
    const jsonStart = versionResult.stdout.indexOf("{");
    assert.notEqual(jsonStart, -1);
    const version = JSON.parse(versionResult.stdout.slice(jsonStart));
    assert.equal(version.prisma, "6.19.3");

    function installedEnginePath(key, prefix) {
      const value = version[key];
      assert.equal(typeof value, "string");
      assert.ok(value.startsWith(prefix));
      const match = value.match(/\(at (.+)\)$/);
      assert.ok(match);
      const path = resolve(repositoryRoot, match[1]);
      assert.ok(existsSync(path));
      return path;
    }

    installedEnginePath("query-engine-(node-api)", "libquery-engine ");
    const schemaEngine = installedEnginePath(
      "schema-engine",
      "schema-engine-cli ",
    );
    const engineVersion = spawnSync(schemaEngine, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(engineVersion.status, 0, engineVersion.stderr);
    assert.match(engineVersion.stdout, /schema-engine/);

    const validateResult = spawnSync(
      process.execPath,
      [prismaCli, "validate", "--schema", "prisma/schema.prisma"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: environment,
        timeout: 20_000,
      },
    );
    assert.equal(validateResult.status, 0, validateResult.stderr);
  },
);
