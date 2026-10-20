import { spawn } from "node:child_process";
import { resolve } from "node:path";

function testDatabaseRootUrl() {
  const value =
    process.env.TEST_DATABASE_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!value) {
    throw new Error(
      "PostgreSQL tests require TEST_DATABASE_URL, DIRECT_URL, or DATABASE_URL in the process environment.",
    );
  }

  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("PostgreSQL tests require a direct postgresql:// connection URL.");
  }

  return url;
}

function urlForSchema(rootUrl, schemaName) {
  const url = new URL(rootUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

export async function runMigrationDeploy(databaseUrl, schemaPath) {
  const prismaCli = resolve("node_modules/prisma/build/index.js");
  const args = [prismaCli, "migrate", "deploy"];
  if (schemaPath) {
    args.push("--schema", schemaPath);
  }

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
    },
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

  if (exitCode !== 0) {
    throw new Error(`Prisma migration deploy failed.\n${output}`);
  }
}

async function createPostgresTestDatabaseInternal(schemaName, applyMigrations) {
  if (!/^[a-z0-9_]+$/.test(schemaName)) {
    throw new Error("PostgreSQL test schema names may only contain lowercase letters, digits, and underscores.");
  }

  const rootUrl = testDatabaseRootUrl();
  const adminUrl = urlForSchema(rootUrl, "public");
  const databaseUrl = urlForSchema(rootUrl, schemaName);
  const { PrismaClient } = await import("@prisma/client");
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });

  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);

  try {
    if (applyMigrations) {
      await runMigrationDeploy(databaseUrl);
    }
  } catch (error) {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect();
    throw error;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  return {
    databaseUrl,
    prisma,
    async cleanup() {
      await prisma.$disconnect();
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await admin.$disconnect();
    },
  };
}

export function createEmptyPostgresTestDatabase(schemaName) {
  return createPostgresTestDatabaseInternal(schemaName, false);
}

export function createPostgresTestDatabase(schemaName) {
  return createPostgresTestDatabaseInternal(schemaName, true);
}
