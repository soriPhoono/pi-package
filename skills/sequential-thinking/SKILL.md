---
name: sequential-thinking
description: 'Structured problem-solving via the sequential thinking tool — mandatory methodology for breaking down complex tasks, debugging, design decisions, planning, and any analysis beyond a simple lookup.'
---

Use this skill whenever you face a non-trivial task — anything involving multiple steps, trade-offs, debugging, design decisions, planning, or analysis that requires more than a single action. **This is not optional for complex work.**

## Overview

The sequential thinking tool (`mcp_sequential_thinking_sequentialthinking`) is a structured thinking protocol that forces methodical problem decomposition. Instead of jumping to conclusions, you work through discrete thoughts — revising, branching, and verifying as your understanding deepens.

Think of it as an external scratchpad for your reasoning. Each thought is deliberate, each revision tracked, each branching path explored before committing.

## When to Use It

You **must** invoke sequential thinking for any of these situations:

| Trigger | Description |
|---------|-------------|
| **Problem breakdown** | Decomposing a complex request into actionable steps |
| **Debugging** | Tracing through a bug, generating hypotheses, testing each systematically |
| **Design decisions** | Evaluating trade-offs between approaches, architectures, or tools |
| **Multi-step operations** | Any task requiring more than 2–3 sequential actions |
| **Planning** | Before starting a large body of work — think through the full scope |
| **Course correction** | When something unexpected happens — re-assess before plunging ahead |
| **Dependency analysis** | Understanding how changes ripple through a system |
| **Analysis with revision risk** | Problems where the full scope isn't clear initially and you might need to backtrack |
| **Filtering irrelevant info** | When you need to sift signal from noise in a large context |
| **Hypothesis generation** | Before committing to a solution path — generate, then verify |

### Quick litmus test

If the answer is a single fact lookup, file read, or straightforward command — skip it. If there's any branching, ambiguity, trade-off, or uncertainty — **use sequential thinking**.

## Parameter Reference

| Parameter | Type | Required | Purpose |
|-----------|------|----------|---------|
| `thought` | string | **yes** | Your current thinking step — the content of this thought |
| `nextThoughtNeeded` | boolean | **yes** | Whether another thought is needed (set `false` only when complete) |
| `thoughtNumber` | number | **yes** | Current position in the thought sequence |
| `totalThoughts` | number | **yes** | Current estimate of how many thoughts you'll need (adjust as you go) |
| `isRevision` | boolean | no | Whether this thought revises a previous one |
| `revisesThought` | number | no | Which thought number is being reconsidered (requires `isRevision: true`) |
| `branchFromThought` | number | no | Which thought number to branch from (for exploring alternatives) |
| `branchId` | string | no | Identifier for the current branch (if branching) |
| `needsMoreThoughts` | boolean | no | Signal when you reach what seemed like the end but need more |

### How the Parameters Interact

```
Linear flow:    thought 1 → thought 2 → thought 3 → ... → DONE
                                        ↓
Revision flow:  thought 1 → thought 2 → REVISION of thought 2 → thought 3
                                        ↓
Branching flow: thought 1 → thought 2 ──→ thought 3a (branch-A)
                                        └─→ thought 3b (branch-B)
```

## The Thinking Process

### 1. Estimate scope

Set `totalThoughts` to a reasonable initial estimate of the steps needed. Don't worry about getting it exactly right — you can adjust it up or down as you progress.

```
thoughtNumber: 1
totalThoughts: 5
```

If you realize you need more steps, increase `totalThoughts` in a later thought. If fewer, just stop early with `nextThoughtNeeded: false`.

### 2. Work through each thought

Each thought should be a discrete, meaningful step in your reasoning. Don't pad with filler — every thought should advance your understanding.

Good thoughts:

- "The request has three parts: A, B, and C. Let me address each in sequence."
- "Looking at the error trace, the crash happens in module X. Possible causes are Y and Z."
- "Approach 1 uses SQL directly, Approach 2 uses an ORM. The trade-offs are..."

### 3. Revise when wrong

Use `isRevision` + `revisesThought` when you realize an earlier thought was incorrect or incomplete:

```json
{
  "thought": "Wait — I assumed the data was normalized, but looking again it's denormalized. That changes my analysis in thought 3. Let me re-evaluate approach B.",
  "nextThoughtNeeded": true,
  "thoughtNumber": 6,
  "totalThoughts": 8,
  "isRevision": true,
  "revisesThought": 3
}
```

### 4. Branch to explore alternatives

Use `branchFromThought` + `branchId` when a single thought opens multiple viable paths:

```json
{
  "thought": "From thought 4, there are two possible root causes. Let me explore branch A first: a config issue.",
  "nextThoughtNeeded": true,
  "thoughtNumber": 5,
  "totalThoughts": 9,
  "branchFromThought": 4,
  "branchId": "config-issue"
}
```

Then for the parallel branch:

```json
{
  "thought": "Now exploring branch B from thought 4: a permissions issue.",
  "nextThoughtNeeded": true,
  "thoughtNumber": 6,
  "totalThoughts": 9,
  "branchFromThought": 4,
  "branchId": "permissions-issue"
}
```

### 5. Generate a hypothesis

Around the midpoint, synthesize what you've learned into a hypothesis:

```json
{
  "thought": "Based on thoughts 1-4, my hypothesis is that the bug is in the WebSocket reconnection handler. The evidence: (a) crash only on network flake, (b) error points to null socket reference, (c) reconnection timer doesn't check socket state.",
  "nextThoughtNeeded": true,
  "thoughtNumber": 5,
  "totalThoughts": 7
}
```

### 6. Verify before concluding

Test your hypothesis. Cross-check evidence. Look for counterexamples:

```json
{
  "thought": "Verifying hypothesis. Does the error trace mention WebSocket? Yes — line 47 shows the null reference. Does the timer code have a guard? No guard found. Is there an alternative explanation? Could also be a race on shutdown — but the trace shows active connection state. Hypothesis holds.",
  "nextThoughtNeeded": true,
  "thoughtNumber": 6,
  "totalThoughts": 7
}
```

### 7. Conclude

Only set `nextThoughtNeeded: false` when you have a complete, verified answer that you're confident in.

```json
{
  "thought": "Final answer: The root cause is missing null-guard in the WebSocket reconnection handler. Fix: add a socket state check before calling reconnect(). The fix should go in src/ws/client.ts around line 45.",
  "nextThoughtNeeded": false,
  "thoughtNumber": 7,
  "totalThoughts": 7
}
```

## Thinking Patterns

### Pattern 1: Linear decomposition

Best for: Multi-step tasks where each step builds on the last.

```
Thought 1: Scope the problem — what are all the parts?
Thought 2: Address part A
Thought 3: Address part B
Thought 4: Address part C
Thought 5: Verify the solution covers all parts
```

### Pattern 2: Hypothesis-driven debugging

Best for: Finding root causes of bugs or errors.

```
Thought 1: Reproduce and observe the symptom
Thought 2: List possible root causes (hypotheses)
Thought 3: Evidence for/against hypothesis A
Thought 4: Evidence for/against hypothesis B
Thought 5: Narrow to most likely cause
Thought 6: Verify with additional check
Thought 7: Propose fix
```

### Pattern 3: Decision tree (branching)

Best for: Design decisions with multiple competing approaches.

```
Thought 1: Define the requirement and constraints
Thought 2: Identify approach A, B, C
        ↓
        ├── branch "approach-A": Analyze trade-offs, pros, cons
        ├── branch "approach-B": Analyze trade-offs, pros, cons
        └── branch "approach-C": Analyze trade-offs, pros, cons
        ↓
Thought N: Synthesize and recommend
```

### Pattern 4: Plan-then-execute

Best for: Large bodies of work where you need a plan before doing.

```
Thought 1: Understand the ask — what does "done" look like?
Thought 2: Inventory what exists (current state)
Thought 3: Break into phases or steps
Thought 4: Identify dependencies between steps
Thought 5: Surface risks or unknowns
Thought 6: Final plan with order
```

### Pattern 5: Course correction

Best for: When something unexpected happened and you need to re-orient.

```
Thought 1: What actually happened vs what was expected?
Thought 2: What assumption was wrong?
Thought 3 (revision): Revise the assumption from thought 2
Thought 4: What does this change about the path forward?
Thought 5: New plan
```

## Best Practices

### Do

- **Start with a scope estimate** — set `totalThoughts` early, even if it's a guess
- **Each thought is one step** — don't cram multiple ideas into a single thought
- **Use branches for genuine forks** — when a single question has multiple answers, branch
- **Use revisions when wrong** — it's better to correct course mid-stream than to barrel ahead with bad assumptions
- **Generate a hypothesis at midpoint** — forces you to synthesize before verifying
- **Verify before concluding** — cross-check against evidence, consider alternatives
- **Adjust `totalThoughts` as you go** — going over your estimate is normal and expected
- **Be explicit about uncertainty** — if you're not sure, say so in the thought

### Don't

- **Don't use it for trivial lookups** — a simple file read or command doesn't need this
- **Don't pad with filler thoughts** — every thought should advance the analysis
- **Don't set `nextThoughtNeeded: false` prematurely** — only conclude when verified
- **Don't ignore branches** — if a thought opens multiple paths, branch explicitly rather than collapsing them
- **Don't get married to your initial `totalThoughts`** — adjusting is part of the process

## Common Mistakes

| Mistake | Why it's a problem | What to do instead |
|---------|--------------------|--------------------|
| Using it for single-step tasks | Overhead without benefit | Skip it for lookups and simple commands |
| Setting `nextThoughtNeeded: false` without verification | Delivers unverified conclusions | Run a verification thought first |
| Never branching | Implicitly collapsing alternatives halves exploration | Branch when a decision point has multiple valid paths |
| Never revising | Sticking to an initial wrong assumption | Revise as soon as you spot an error |
| One thought doing too much | Buried reasoning, hard to revise specific parts | Split into multiple focused thoughts |

## Relationship to Other Skills

- **knowledge-graph-model** / **knowledge-graph-operations** — Use sequential thinking to plan what to store in the knowledge graph and in what structure
- **git-worktrees** — Use sequential thinking to decide which worktree pattern fits the task
- **plan-mode** — Sequential thinking is the cognitive layer above plan-mode; use it to design the plan, then execute via plan-mode
