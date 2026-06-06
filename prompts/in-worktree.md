<!-- in-worktree prompt template -->

<!-- Usage: type `/in-worktree` to expand, then describe the work to do -->

<!-- Load the git-worktrees skill for best practices -->

<read path="/home/sphoono/.pi/agent/git/github.com/soriPhoono/pi-package/skills/git-worktrees/SKILL.md" />

## Task: Do all work in a new git worktree

You must create an isolated git worktree before starting any work. Do not modify files in the current working directory.

### Worktree creation

1. **Check current state** — run `git status` and `git branch --show-current` to confirm the current branch and that the tree is clean.
1. **Name the branch** — derive a short, descriptive branch name from the task (e.g. `feat/add-login`, `fix/null-pointer`, `refactor/cache-layer`).
1. **Create the worktree** — using the "AI agent isolation" pattern from the git-worktrees skill:
   ```bash
   git worktree add -b <branch-name> ../<project>-<branch-name> <base-branch>
   ```
   - `<base-branch>` is typically `main` unless the task depends on another feature branch.
   - Use the sibling directory naming convention: `{project}-{branch}`.
1. **Install dependencies** — each worktree has its own `node_modules`, `.venv`, etc. Run the appropriate install command inside the worktree immediately.

### Working inside the worktree

- All file edits, tests, and commands must be run inside the worktree directory.
- Commit early and often with conventional commit messages (`feat:`, `fix:`, `refactor:`, etc.).
- Fetch from the main repo regularly to stay synced:
  ```bash
  git fetch --all
  git rebase origin/main
  ```

### Cleanup

When the task is complete:

1. Ensure everything is committed in the worktree.
1. Return to the main worktree and review the diff:
   ```bash
   cd <path-to-main-worktree>
   git diff main..<branch-name>
   ```
1. Present the diff to the user and ask for confirmation before:
   - Merging, pushing, or creating a PR.
   - Removing the worktree with `git worktree remove ../<worktree-dir>`.
   - Deleting the branch with `git branch -D <branch-name>` if the work is discarded.

### If the task requires running a server or long-lived process

Start it inside the worktree. The process is fully isolated from your main work environment. Inform the user which port is being used and that the worktree directory is where the files live.
