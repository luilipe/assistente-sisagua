import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const tests = [
  "legal-data-consistency.mjs",
  "core-validation.mjs",
  "parser-ammonia-context.mjs",
  "parser-ignored-and-base.mjs",
  "parser-numeric.mjs",
  "parser-radioactivity-total.mjs",
  "parser-safety.mjs",
  "parser-full-lot.mjs",
  "header-contract.mjs",
  "manifest-safety.mjs",
  "content-transaction.mjs",
  "content-point-resolution.mjs",
  "content-radioactivity.mjs",
  "content-preflight-transaction.mjs",
  "content-existing-status-audit.mjs",
  "content-storage-migration.mjs",
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(testDir, test)], {
    cwd: path.resolve(testDir, "..", ".."),
    encoding: "utf8",
    env: process.env,
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  process.stdout.write("\n");
  if (result.status !== 0) process.exit(result.status || 1);
}

process.stdout.write(`testes: ${tests.length}/${tests.length} ok\n`);
