import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/neon-v24-migration-status.yml",
  import.meta.url,
);
const workflow = await readFile(workflowUrl, "utf8");

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
    workflow.indexOf("Install locked dependencies without database credentials") <
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
