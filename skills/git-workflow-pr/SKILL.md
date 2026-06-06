______________________________________________________________________

## name: git-workflow-pr description: Complete git workflow with GitHub PR requirements — branch discipline, committing, pushing with user confirmation, and pull request lifecycle management.

Use this skill for the full git lifecycle: starting work from `main`, creating feature branches, committing changes, pushing with user approval, creating pull requests on GitHub, managing reviews, and merging.

## Overview

The git workflow enforces a **human-in-the-loop** process: the agent handles the mechanics of branching, committing, and PR creation, but the user must explicitly approve every push to a remote. PRs are always created after pushing.

### Workflow at a glance

```
main (read-only)
  → feature branch (created FROM main, must match the change)
    → commit (via git-commit skill)
    → user confirms push
      → push to origin
        → create pull request on GitHub (targeting main)
          → manage PR lifecycle (review, update, merge)
```

## Branch Discipline

### Main is read-only

Never commit directly on `main`. **Always create new branches off `main`**, regardless of the currently checked-out branch. When a request arrives:

```
1. Create a feature branch FROM main with a name matching the change
2. Switch to it
3. Proceed with work
```

Tool: `mcp_git_git_branches` with `action: "create"`, `name: "<branch-name>"`, and `from_ref: "main"`.

### Feature branches must match the change

Before altering a branch, confirm its name fits the work:

| Situation | Action |
|-----------|--------|
| Branch name fits the change | Work on it |
| Branch name does NOT fit | Commit current state, switch to properly named branch |
| An existing branch already covers the work | Use it (checkout) |

### Branch naming conventions

Use conventional branch names following the pattern `<type>/<description>`:

```
feature/add-user-auth
fix/login-timeout
refactor/api-client
docs/readme-update
experiment/webgpu-renderer
chore/update-dependencies
```

Tool: `mcp_git_git_branches`

| Action | Description |
|--------|-------------|
| `list` | List all branches |
| `create` | Create a new branch off `main` (`name` + `from_ref: "main"`) |
| `checkout` | Switch branches (`name` or `branch`) |
| `delete` | Delete a branch (`name`) |
| `rename` | Rename (`old_name` → `new_name`) |

## Making Changes and Committing

Changes are committed using the **git-commit skill** (see `skills/git-commit/`). The key steps:

1. Check status: `mcp_git_git_status`
1. Stage files: `mcp_git_git_commits` with `action: "add"` and `paths: [...]`
1. Commit: `mcp_git_git_commits` with `action: "commit"` and `message: "<conventional commit>"`

The git-commit skill handles:

- Analyzing the diff to determine commit type and scope
- Generating conventional commit messages (`feat:`, `fix:`, `refactor:`, etc.)
- Intelligent file staging

**Commit conventions:**

```
<type>(<scope>): <description>

<optional body>

<optional footer>
```

## Pushing

### Critical rule: never push without user confirmation

Pushing is a **separate step** from committing and requires explicit user approval. Ask the user before pushing.

```
Before pushing: "I have N commits ready to push to <remote>/<branch>. Shall I push?"
After approval: proceed
Without approval: don't push
```

### Push mechanics

Tool: `mcp_git_git_remotes` with `action: "push"`

| Parameter | When to use |
|-----------|-------------|
| `remote` | Usually `origin` |
| `branch` | The feature branch being pushed |
| `set_upstream` | On first push of a new branch |
| `force_with_lease` | Only when rebasing and the user explicitly authorizes force push |

### First push of a new branch

```json
{
  "action": "push",
  "remote": "origin",
  "branch": "feature/add-user-auth",
  "set_upstream": true
}
```

## Pull Request Creation

After the push succeeds, **immediately** create a pull request using the GitHub MCP server.

Tool: `mcp_github_create_pull_request`

| Parameter | Required | Description |
|-----------|----------|-------------|
| `base` | yes | Target branch (typically `main`) |
| `head` | yes | Your feature branch name |
| `title` | yes | Clear, descriptive title matching the change |
| `body` | no | Summary of what was done and why |
| `draft` | no | `true` if WIP, `false` if ready for review |
| `maintainer_can_modify` | no | Allow maintainer edits |

### PR creation flow

```
1. ✅ Get user confirmation to push the branch
2. 🚀 Push to origin
3. 📝 Call mcp_github_create_pull_request with:
     - base: main
     - head: feature/add-user-auth
     - title: "feat: add user authentication with JWT"
     - body:  (summary of changes, what was done and why)
     - draft: false (or true if still in progress)
4. 🔗 Inform the user of the PR URL
```

### Writing a good PR body

The PR body should include:

```markdown
## Summary
What this PR does and why.

## Changes
- List of key changes
- Bullet points are fine

## Related
Closes #123
Refs #456
```

## Pull Request Lifecycle

### Reading PR details

Tool: `mcp_github_pull_request_read`

| Method | What it returns |
|--------|-----------------|
| `get` | Full PR details (title, body, status, labels, reviewers) |
| `get_diff` | The diff of the PR |
| `get_files` | List of changed files |
| `get_comments` | PR comments (not review comments) |
| `get_review_comments` | Review threads with comments |
| `get_reviews` | Reviews submitted on the PR |
| `get_status` | Combined commit status (CI checks) |
| `get_check_runs` | Individual CI/CD check runs |

### Updating a PR

Tool: `mcp_github_update_pull_request`

| Parameter | When to use |
|-----------|-------------|
| `title` | Rename/mark changes in scope |
| `body` | Add context, update description |
| `state` | Close or reopen (`"open"` or `"closed"`) |
| `draft` | Mark ready for review (`false`) or back to draft (`true`) |
| `reviewers` | Add reviewer GitHub usernames |
| `base` | Change target branch (rare) |
| `maintainer_can_modify` | Toggle maintainer write access |

### Refreshing a PR branch

When the base branch has advanced and the PR is behind:

Tool: `mcp_github_update_pull_request_branch`

This merges the latest base branch into the PR's head branch. Only pass `expectedHeadSha` if you want to ensure no concurrent changes.

### Requesting reviews

To get automated code review feedback:

Tool: `mcp_github_request_copilot_review`

Request a GitHub Copilot code review for the PR. Use before requesting a human reviewer.

To add human reviewers: use `mcp_github_update_pull_request` with `reviewers: ["username1", "username2"]`.

### Reviewing and commenting

**Adding a comment on a PR:**

Tool: `mcp_github_add_issue_comment`

```json
{
  "issue_number": 42,
  "body": "Good catch on the null check. Fixed in latest push.",
  "owner": "org-name",
  "repo": "repo-name"
}
```

**Review comments (on specific lines of code):**

Tool: `mcp_github_pull_request_review_write`

| Method | Use case |
|--------|----------|
| `create` | Start a new review (pass `event` to submit immediately: `APPROVE`, `REQUEST_CHANGES`, `COMMENT`) |
| `submit_pending` | Submit an existing pending review |
| `delete_pending` | Delete a pending review |
| `resolve_thread` | Mark a review thread as resolved |
| `unresolve_thread` | Re-open a resolved thread |

For adding comments to a pending review:

Tool: `mcp_github_add_comment_to_pending_review`

### Merging a PR

Tool: `mcp_github_merge_pull_request`

| Parameter | Description |
|-----------|-------------|
| `pullNumber` | PR number |
| `merge_method` | Strategy: `"merge"`, `"squash"`, or `"rebase"` |
| `commit_title` | Title for the merge commit |
| `commit_message` | Extra detail for the merge commit |

**Merge method selection:**

| Method | When to use |
|--------|-------------|
| `merge` | Preserving history — creates a merge commit |
| `squash` | Collapsing a feature branch into one commit — clean linear history on base |
| `rebase` | Rebasing commits onto base — preserves individual commits, linear history |

### Listing and searching PRs

**List PRs on a repo:**

Tool: `mcp_github_list_pull_requests`

Filter by `state` (`open`, `closed`, `all`), `base`, `head`, `sort`, `direction`.

**Search across GitHub:**

Tool: `mcp_github_search_pull_requests`

Query syntax: `is:pr repo:owner/name state:open label:bug`.

## Example: Full Workflow

```typescript
// 1. Create feature branch FROM main (regardless of current branch)
mcp_git_git_branches({
  action: "create",
  name: "fix/login-timeout",
  from_ref: "main"
})

// 2. Make changes, commit (via git-commit skill)
mcp_git_git_commits({ action: "add", paths: ["src/auth/login.ts"] })
mcp_git_git_commits({
  action: "commit",
  message: "fix(auth): increase login timeout from 5s to 30s\n\nSome users with slow connections were timing out before completing authentication."
})

// 3. Ask user for push approval
// "I committed the fix. Shall I push fix/login-timeout to origin?"

// 4. Push (after user confirms)
mcp_git_git_remotes({
  action: "push",
  remote: "origin",
  branch: "fix/login-timeout",
  set_upstream: true
})

// 5. Create pull request (targeting main)
mcp_github_create_pull_request({
  base: "main",
  head: "fix/login-timeout",
  title: "fix(auth): increase login timeout from 5s to 30s",
  body: "## Summary\nIncreases the login authentication timeout to accommodate users on slow connections.\n\n## Changes\n- Bumped timeout from 5s to 30s in `src/auth/login.ts`\n- Added warning log when timeout approaches\n\nCloses #89",
  draft: false
})

// 6. Inform user of PR URL
```

## Best Practices

### Branch workflow

- **Main is read-only** — never commit or push directly to main
- **Branch name matches the change** — rename or recreate if scope changes
- **One branch per logical change** — don't bundle unrelated work
- **Delete branches after merge** — clean up locally and remotely

### Push discipline

- **Never push without asking** — always get user confirmation first
- **Pushing is separate from committing** — don't conflate them
- **Use `set_upstream` on first push** — ensures tracking is configured
- **Avoid force push** — only with explicit user authorization, and only with `force_with_lease`

### PR quality

- **Descriptive title** — follows conventional commit format: `type(scope): description`
- **Informative body** — explain what changed and why, reference issues
- **Draft for WIP** — use `draft: true` if the PR isn't ready for review
- **Request Copilot review** before requesting human reviewers
- **Keep PRs focused** — small, single-purpose PRs are easier to review and merge

### PR management

- **Update PR body** if the scope changes after creation
- **Refresh PR branch** when base has advanced and conflicts are likely
- **Select merge strategy deliberately** — squash for feature branches, merge for shared branches, rebase for clean linear history
- **Close stale PRs** — if a PR is abandoned, close it rather than leaving it open

## Tool Index

| Step | Tool | Key action/parameters |
|------|------|-----------------------|
| Check status | `mcp_git_git_status` | — |
| List branches | `mcp_git_git_branches` | `action: "list"` |
| Create branch | `mcp_git_git_branches` | `action: "create"`, `name`, `from_ref: "main"` |
| Checkout branch | `mcp_git_git_branches` | `action: "checkout"`, `name` |
| Stage files | `mcp_git_git_commits` | `action: "add"`, `paths: [...]` |
| Commit | `mcp_git_git_commits` | `action: "commit"`, `message` |
| Push | `mcp_git_git_remotes` | `action: "push"`, `remote`, `branch`, `set_upstream` |
| Create PR | `mcp_github_create_pull_request` | `base`, `head`, `title`, `body`, `draft` |
| Read PR | `mcp_github_pull_request_read` | `method: "get"`, `pullNumber` |
| Update PR | `mcp_github_update_pull_request` | `title`, `body`, `state`, `draft`, `reviewers` |
| Refresh PR branch | `mcp_github_update_pull_request_branch` | `pullNumber` |
| Request review | `mcp_github_request_copilot_review` | `pullNumber` |
| Merge PR | `mcp_github_merge_pull_request` | `pullNumber`, `merge_method` |
| Add comment | `mcp_github_add_issue_comment` | `issue_number`, `body` |
| List PRs | `mcp_github_list_pull_requests` | `state`, `base`, `head` |

## Relationship to Other Skills

- **git-commit** — Handles the commit step in detail (diff analysis, message generation, conventional commit format). This skill references it rather than duplicating it.
- **sequential-thinking** — Use before the workflow starts to plan the branch structure and commit strategy
- **knowledge-graph-operations** — Store PR URLs, decisions, and outcomes in session entities after merging
