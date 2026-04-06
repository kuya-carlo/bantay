import { execSync } from "node:child_process";

export type GitContext = {
  isRepo: boolean;
  hasCommits: boolean;
  isInitialCommit: boolean;
};

export function getGitContext(): GitContext {
  try {
    execSync("git rev-parse --git-dir", { stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    return { isRepo: false, hasCommits: false, isInitialCommit: false };
  }

  try {
    execSync("git rev-parse HEAD", { stdio: ["pipe", "pipe", "pipe"] });
    const count = parseInt(
      execSync("git rev-list --count HEAD", { stdio: ["pipe", "pipe", "pipe"] })
        .toString()
        .trim()
    );
    return { isRepo: true, hasCommits: count >= 1, isInitialCommit: count === 1 };
  } catch {
    return { isRepo: true, hasCommits: false, isInitialCommit: false };
  }
}
