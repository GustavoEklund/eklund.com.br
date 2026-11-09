/**
 * The tests that build a repository of their own in a temporary folder run git there. Inside a git hook, as in the pre-push
 * that runs the suite, git exports GIT_DIR, GIT_INDEX_FILE and the like, which point at the repository being pushed; in a
 * linked worktree they are absolute, and a fixture's commits would land on the branch being pushed. Leaving them out of
 * the environment keeps every git command, the tools' own included, inside the folder it runs in.
 */
export class GitEnvironment {
  static isolate() {
    for (const name of Object.keys(process.env))
      if (name.startsWith('GIT_')) delete process.env[name];
  }
}
