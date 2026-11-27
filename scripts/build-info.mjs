// The commit a build is made from, for GET /api/version (spec 8.5, AC23).
// Builds refuse to run without git: a deployed Worker that cannot say which commit it is
// fails the "prove what is running" check (spec 11). Dev and tests may run without git and
// then report "unknown" rather than a made-up value.
import { execFileSync } from "node:child_process";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** @param {{ requireGit: boolean }} options */
export function buildInfo({ requireGit }) {
  try {
    const commit = git("rev-parse", "HEAD");
    // Tracked changes not in the commit: the build is not exactly that commit.
    const dirty = git("status", "--porcelain", "--untracked-files=no") !== "";
    return { commit, dirty };
  } catch (error) {
    if (requireGit) {
      throw new Error(`Cannot read the commit with git, so the build cannot say what it is: ${error.message}`);
    }
    return { commit: "unknown", dirty: false };
  }
}
