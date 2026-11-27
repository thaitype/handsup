// The one command for milestone checks (review R26): every check, in order. It runs them all,
// prints a summary, and exits non-zero if any failed.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const steps = ["typecheck", "test", "build", "check:bundle", "test:e2e:spikes", "test:e2e:app", "test:e2e:slow"];

// So that check:bundle can only ever inspect what this run built.
rmSync(`${root}dist`, { recursive: true, force: true });

const results = steps.map((step) => {
  console.log(`\n=== gate: pnpm run ${step}`);
  const started = Date.now();
  const run = spawnSync("pnpm", ["run", step], { cwd: root, stdio: "inherit" });
  // A step killed by a signal has no status and counts as failed.
  return { step, passed: run.status === 0, seconds: Math.round((Date.now() - started) / 1000) };
});

console.log("\n=== gate summary");
for (const { step, passed, seconds } of results) {
  console.log(`${passed ? "PASS" : "FAIL"}  ${step}  (${seconds}s)`);
}
const failed = results.filter((result) => !result.passed).length;
console.log(failed === 0 ? "gate: all checks passed" : `gate: ${failed} of ${results.length} checks FAILED`);
process.exit(failed === 0 ? 0 : 1);
