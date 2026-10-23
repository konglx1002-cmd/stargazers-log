import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pins the runtime and separates development and production migrations", async () => {
  const nodeVersion = (await readFile(".nvmrc", "utf8")).trim();
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const pnpmLock = await readFile("pnpm-lock.yaml", "utf8");

  assert.match(nodeVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(packageJson.packageManager, "pnpm@10.34.6");
  assert.match(pnpmLock, /^lockfileVersion: '9\.0'$/m);
  assert.equal(packageJson.scripts.build, "next build --webpack");
  assert.equal(packageJson.scripts.postinstall, "prisma generate");
  assert.equal(packageJson.scripts["test:deploy"], "node --test --test-concurrency=1");
  assert.equal(packageJson.scripts["check:deployment"], "node scripts/check-deployment.mjs");
  assert.equal(packageJson.scripts["db:migrate:dev"], "prisma migrate dev");
  assert.equal(packageJson.scripts["db:migrate:deploy"], "prisma migrate deploy");
});

test("provides GitHub Actions CI and manual staging migration workflows", async () => {
  const ci = await readFile(".github/workflows/ci.yml", "utf8");
  const migration = await readFile(".github/workflows/migrate.yml", "utf8");

  assert.match(ci, /node-version: 24\.x/);
  assert.match(ci, /version: 10\.34\.6/);
  assert.match(ci, /pnpm install --frozen-lockfile/);
  assert.match(ci, /pnpm exec prisma generate/);
  assert.match(ci, /pnpm lint/);
  assert.match(ci, /pnpm test:deploy/);
  assert.match(ci, /pnpm build/);
  assert.match(ci, /image: postgres:16/);

  assert.match(migration, /workflow_dispatch:/);
  assert.match(migration, /environment: staging/);
  assert.match(migration, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.match(migration, /DIRECT_URL: \$\{\{ secrets\.DIRECT_URL \}\}/);
  assert.match(migration, /pnpm exec prisma validate/);
  assert.match(migration, /pnpm exec prisma migrate status/);
  assert.match(migration, /pnpm exec prisma migrate deploy/);
  assert.doesNotMatch(migration, /postgresql:\/\//);
});

test("production baseline reports sanitized failure categories", async () => {
  const workflow = await readFile(
    ".github/workflows/neon-v24-production-migrate.yml",
    "utf8",
  );
  const baselineStep = workflow.match(
    /- name: Capture production old-data baseline \(read only\)[\s\S]*?(?=\n      - name: Deploy exactly once)/,
  )?.[0];

  assert.ok(baselineStep);
  const baselineScript = baselineStep.match(
    /node <<'NODE'\r?\n([\s\S]*?)\r?\n\s+NODE/,
  )?.[1];
  assert.ok(baselineScript);
  const syntaxCheck = spawnSync(process.execPath, ["--check", "-"], {
    input: baselineScript,
    encoding: "utf8",
  });
  assert.equal(syntaxCheck.status, 0, syntaxCheck.stderr);
  assert.match(baselineStep, /Production endpoint validation failed\./);
  assert.match(baselineStep, /Production psql connection or TLS validation failed\./);
  assert.match(baselineStep, /Production read-only baseline query timed out\./);
  assert.match(baselineStep, /Production read-only baseline result parsing failed\./);
  assert.match(baselineStep, /Production baseline has changed since the reviewed snapshot/);
  assert.match(baselineStep, /Production read-only SQL execution failed\./);
  assert.match(baselineStep, /PGSSLMODE:'verify-full'/);
  assert.match(baselineStep, /default_transaction_read_only=on/);
  assert.doesNotMatch(baselineStep, /Production read-only baseline failed\./);
  assert.doesNotMatch(
    baselineStep,
    /console\.(?:log|error)\([^\n]*(?:result\.(?:stdout|stderr)|NEON_PROD_DIRECT_URL)/,
  );
  assert.doesNotMatch(baselineStep, /throw new Error\([^\n]*(?:stdout|stderr|NEON_PROD_DIRECT_URL)/);
});

test("deployment check reports missing variable names without exposing values", async () => {
  const secretValue = "must-not-appear-in-output";
  const env = { ...process.env, BETTER_AUTH_SECRET: secretValue };
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;
  delete env.BETTER_AUTH_URL;

  const child = spawn(process.execPath, ["scripts/check-deployment.mjs"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });

  assert.equal(exitCode, 1);
  assert.match(output, /DATABASE_URL/);
  assert.match(output, /DIRECT_URL/);
  assert.match(output, /BETTER_AUTH_URL/);
  assert.doesNotMatch(output, new RegExp(secretValue));
});

test("provides a production environment template without real credentials", async () => {
  const template = await readFile(".env.production.example", "utf8");
  const requiredVariables = [
    "DATABASE_URL",
    "DIRECT_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
  ];

  for (const variable of requiredVariables) {
    assert.match(template, new RegExp(`^${variable}=`, "m"));
  }

  assert.match(template, /APP_USER:APP_PASSWORD@POOL_HOST/);
  assert.match(template, /MIGRATION_USER:MIGRATION_PASSWORD@DIRECT_HOST/);
  assert.match(template, /replace-with-a-production-secret/);
  assert.match(template, /https:\/\/your-domain\.example\.com/);
});

test("provides an isolated local PostgreSQL Compose environment", async () => {
  const compose = await readFile("docker-compose.yml", "utf8");
  const localEnvironment = await readFile(".env.local.example", "utf8");
  const gitignore = await readFile(".gitignore", "utf8");

  assert.match(compose, /^\s{2}scientific-log-postgres:/m);
  assert.match(compose, /image: postgres:17-alpine/);
  assert.match(compose, /"5433:5432"/);
  assert.match(compose, /POSTGRES_USER: scientific_log/);
  assert.match(compose, /POSTGRES_PASSWORD: scientific_log_password/);
  assert.match(compose, /POSTGRES_DB: scientific_growth_log/);
  assert.match(compose, /pg_isready -U scientific_log -d scientific_growth_log/);

  assert.match(localEnvironment, /^DATABASE_URL=.*localhost:5433/m);
  assert.match(localEnvironment, /^DIRECT_URL=.*localhost:5433/m);
  assert.match(gitignore, /^!\.env\.local\.example$/m);
});

test("uses a PostgreSQL schema and a PostgreSQL-only migration history", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const migrationLock = await readFile("prisma/migrations/migration_lock.toml", "utf8");
  const initialMigration = await readFile(
    "prisma/migrations/20261014000000_postgresql_init/migration.sql",
    "utf8",
  );

  assert.match(schema, /provider\s+=\s+"postgresql"/);
  assert.match(schema, /directUrl\s+=\s+env\("DIRECT_URL"\)/);
  assert.match(migrationLock, /provider = "postgresql"/);
  assert.match(initialMigration, /TIMESTAMP\(3\)/);
  assert.doesNotMatch(initialMigration, /PRAGMA|DATETIME|new_Diary|new_User/);
});
