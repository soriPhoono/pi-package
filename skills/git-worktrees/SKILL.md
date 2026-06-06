______________________________________________________________________

## name: git-worktrees description: Guide for the proper use of git worktrees — managing multiple working directories from a single repository for parallel development, hotfixes, code review, and AI agent isolation.

Use this skill when working with multiple branches simultaneously, handling urgent hotfixes while mid-feature, reviewing PRs without disrupting current work, or setting up isolated environments for AI coding agents.

## Overview

Git worktrees let you check out multiple branches of the same repository into separate directories simultaneously. Each worktree has its own working directory, staging area, build artifacts, and `node_modules`, but they all share the same Git object database and history. No stashing, no second clone, no losing your place.

Available since Git 2.5 (2015). Verify with `git --version`.

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Main worktree** | The original clone directory — the first working tree |
| **Linked worktree** | An additional working directory created via `git worktree add` |
| **Shared** | All Git objects, refs, reflog, config, hooks — shared across all worktrees |
| **Independent** | Working directory, index/staging area, `HEAD`, build artifacts — separate per worktree |
| **`.git` file** | Linked worktrees have a `.git` *file* (not directory) pointing back to the main repo's `.git/worktrees/<id>` |
| **Branch locking** | A branch can only be checked out in one worktree at a time |

### Comparison

| Aspect | Worktree | Stash | Clone |
|--------|----------|-------|-------|
| Disk space | Low (shared objects) | None | High (full copy) |
| Parallel branches | Yes | No (sequential) | Yes |
| Shared history | Yes (instant) | Yes | No (needs fetch/push) |
| Build isolation | Yes | No | Yes |
| Setup time | Seconds | Instant | Minutes (network) |
| Context switching | None — keep both open | Full (stash/pop) | None — keep both open |

## Basic Commands

### Create a worktree

```bash
# Create from an existing branch
git worktree add ../project-feature feature-branch

# Create and check out a new branch
git worktree add -b new-feature ../project-new-feature main
```

### List worktrees

```bash
git worktree list
```

Example output:

```
/home/user/project  main    [abc1234]
/home/user/project-feature  feature-branch  [def5678]
/home/user/project-hotfix  hotfix-fix-login  [ghi9012]
```

### Remove a worktree

```bash
# Safe — deletes directory and cleans up metadata
git worktree remove ../project-feature

# Force remove (discards uncommitted changes)
git worktree remove --force ../project-feature
```

### Prune stale references

If a worktree directory was deleted manually (`rm -rf`), clean up stale metadata:

```bash
git worktree prune
```

### Lock a worktree

Prevent a worktree from being pruned (useful for removable media or network mounts):

```bash
git worktree lock ../project-feature --reason "On external drive"
```

## Directory Layout

### Standard layout (sibling directories)

```
~/projects/
├── myproject/                  # Main worktree (main branch)
├── myproject-feature-auth/     # Feature worktree
├── myproject-hotfix-login/     # Hotfix worktree
├── myproject-review-pr42/      # Code review worktree
└── myproject-agent-refactor/   # AI agent worktree
```

Use a consistent naming pattern: `{project}-{branch-or-purpose}`.

### Bare repo layout (advanced)

For heavy worktree users, the bare repo pattern keeps everything in one folder:

```
~/dev/myproject/
├── .bare/            # All Git data (bare clone)
├── .git              # File containing: gitdir: ./.bare
├── main/             # Worktree: main branch (pristine reference)
├── feature-auth/     # Worktree: feature-auth
├── hotfix-login/     # Worktree: hotfix-login
└── agent-tidy/       # Worktree: AI agent work
```

**Setup:**

```bash
mkdir myproject && cd myproject
git clone --bare https://github.com/user/repo.git .bare
echo "gitdir: ./.bare" > .git

# Fetch all branches (bare clones only fetch default by default)
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
git config worktree.useRelativePaths true
git fetch --all

# Create worktrees as subdirectories
git worktree add main main
git worktree add feature-auth origin/feature-auth
```

Benefits: one folder for everything, no orphaned worktrees on delete, easy to move, room for agent configs and tooling at the project root level.

## Workflows

### 1. Emergency hotfix while mid-feature

```bash
# You're in the middle of feature work on main worktree
# Production bug needs an immediate fix

# Create a worktree for the hotfix
git worktree add -b hotfix-critical ../project-hotfix main

# Fix the bug, commit, push
cd ../project-hotfix
# ... edit files ...
git add .
git commit -m "fix: critical production bug"
git push origin hotfix-critical

# Clean up
cd ../project
git worktree remove ../project-hotfix

# Back to feature work — everything untouched
```

### 2. Parallel feature development

```bash
# Create worktrees for two features
git worktree add -b feature/payments ../project-payments main
git worktree add -b feature/search  ../project-search main

# Work on both simultaneously in separate terminals/editors
cd ../project-payments   # Terminal 1: payments work
cd ../project-search     # Terminal 2: search work

# Install dependencies per worktree (each is independent)
cd ../project-payments && npm install
cd ../project-search   && npm install
```

### 3. Code review

```bash
# Review a PR without disturbing current work
git worktree add ../project-review-pr42 origin/pr/42

# View the diff against main
cd ../project-review-pr42
git diff main...HEAD
```

### 4. AI agent isolation

Spin up isolated worktrees for AI coding agents without risking your active work:

```bash
# Create a worktree for an agent task
git worktree add -b agent-refactor-utils ../project-agent-refactor main

# Point the agent at it, then review the diff
git diff main...agent-refactor-utils

# Discard if unsatisfied — just delete the worktree and branch
git worktree remove ../project-agent-refactor
git branch -D agent-refactor-utils
```

Multi-agent parallelism:

```
~/dev/project/
├── main/                    # Pristine reference — never work directly in it
├── feature-auth/            # Your work
├── agent-refactor-utils/    # Agent 1
├── agent-add-tests/         # Agent 2
└── agent-fix-types/         # Agent 3
```

### 5. Parallel testing / CI simulation

```bash
git worktree add -b test/feature-a ../project-test-a main
git worktree add -b test/feature-b ../project-test-b main

# Run test suites in parallel in separate terminals
cd ../project-test-a && npm test
cd ../project-test-b && npm test
```

### 6. Git bisect with worktrees (bisect on one, fix on another)

```bash
# Start bisect from your main worktree
git bisect start
git bisect bad HEAD
git bisect good v1.0

# Git checks out different commits — work directly here
# ...

git bisect reset
```

For long bisects, create a dedicated worktree so you can keep working elsewhere:

```bash
git worktree add ../project-bisect --detach HEAD
cd ../project-bisect
git bisect start
# ... bisect in this worktree, work on main worktree in parallel
```

## Updating Worktrees

Worktrees do not auto-sync. Keep them up to date:

```bash
# From the main worktree — a single fetch updates all worktrees
git fetch --all

# Inside each worktree, rebase or merge as needed
cd ../project-feature
git rebase origin/main
```

**Recommended sync strategies:**

| Strategy | Command | When to use |
|----------|---------|-------------|
| Rebase | `git rebase origin/main` | Feature branches — clean linear history |
| Merge | `git merge origin/main` | Shared or long-lived branches |
| Pre-push sync | Both of the above | Before pushing to avoid rejects |
| Scheduled | As part of daily start | Start each day with `git fetch --all; git rebase origin/main` in each active worktree |

## Best Practices

### Do

- **Keep `main/` pristine** — never commit directly in the main worktree. Use it as a clean reference for diffing and creating new branches.
- **Name worktrees after branches** — `project-branchname` so directory = branch = no confusion.
- **Install dependencies immediately** after creating a worktree (each worktree has its own `node_modules`, `venv`, etc.).
- **Clean up when done** — remove the worktree immediately after merging or discarding a branch.
- **Run `git worktree list`** regularly to see what is active.
- **Use `--force-with-lease`** when pushing from any worktree.
- **Keep 2–3 worktrees active** — each is a full file checkout; too many waste disk and cognitive space.

### Don't

- **Don't check out the same branch** in two worktrees — Git prevents this.
- **Don't nest worktrees** inside other worktree directories.
- **Don't manually delete worktree directories** without running `git worktree prune` afterward.
- **Don't rely on worktrees for quick \<10 minute switches** — plain `git checkout` or `git stash` is simpler for short interruptions.
- **Don't forget about shared stashes** — stashes are shared across all worktrees. Always use named stashes and check `git stash list` before popping.

### Common Pitfalls

| Pitfall | Problem | Solution |
|---------|---------|----------|
| Dirty worktree removal | `git worktree remove` refuses if there are uncommitted changes or unpushed commits | Use `--force` to discard, or clean up properly |
| Stale worktree refs | `rm -rf` leaves metadata behind | `git worktree prune` |
| Missing dependencies | Each worktree needs its own `node_modules`, `.venv`, etc. | Run install step right after `git worktree add` |
| Stash confusion | Stashes are shared across all worktrees | Use named stashes: `git stash push -m "desc"` |
| Branch can't be deleted | Trying to delete a branch checked out in another worktree | Switch to a different branch in that worktree first |
| Bare clone push failures | No upstream tracking configured | `git branch --set-upstream-to=origin/branch-name` |

## Shell Aliases

```bash
# ~/.bashrc or ~/.zshrc

# Create a worktree named after the project + branch
wt() {
  local branch="${1:?Usage: wt <branch-name> [base-branch]}"
  local base="${2:-main}"
  local dirname="${PWD##*/}-${branch##*/}"
  git worktree add -b "$branch" "../$dirname" "$base"
  echo "Worktree created: ../$dirname"
}

# Remove a worktree
wtr() {
  local dir="${1:?Usage: wtr <directory-path>}"
  git worktree remove "$dir"
}

# List all worktrees
wtl() {
  git worktree list
}

# Prune stale worktree metadata
wtp() {
  git worktree prune
}
```

## Integration Notes

- **VS Code** — Has built-in worktree support since v1.103. Enable it in settings (`git.worktrees`). Each worktree opens as its own project window.
- **JetBrains IDEs** — Worktrees are regular directories; open each as a separate project.
- **Submodules** — Each worktree gets its own copy of submodule working directories. Run `git submodule update --init` in each new worktree.
- **Sparse checkout** — Works normally in worktrees, but must be configured per worktree.
- **Hooks** — Shared across all worktrees (live in the repo's `.git/hooks`). Write robust hooks that use `git rev-parse --show-toplevel` instead of assuming paths.
