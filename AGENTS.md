# Multi-Agent Workflow

This repo uses a peer workflow between Claude Code and Codex. Gemini is not part of the default workflow here.

## Operating Model

- No permanent lead exists.
- The agent directly invoked by the user becomes the driver for that task.
- The other agent becomes the reviewer unless the user explicitly assigns roles differently.
- Use discussion, not silent rewrites: one agent executes, the other critiques, then the driver either fixes objective issues or asks the user to choose on opinionated tradeoffs.

## Review Thresholds

- Skip peer review for tiny copy edits, trivial docs changes, or obviously local one-line fixes.
- Use one review pass for normal implementation work.
- Use two review gates for high-risk work:
  1. pre-code plan critique
  2. post-code diff review

High-risk usually means:

- touching routing, content schemas, config, deployment, analytics, build tooling, or shared utilities
- changing behavior across multiple pages or components
- deleting or renaming files, exports, env vars, or public interfaces
- refactors where the failure mode is subtle rather than immediate

## Repo Facts

- Package manager: `pnpm`
- Main checks:
  - `devcontainer exec --workspace-folder . pnpm lint`
  - `devcontainer exec --workspace-folder . pnpm check`
  - `devcontainer exec --workspace-folder . pnpm build` for route, config, content, or build-system changes, or when end-to-end confidence matters
- This repo may already be dirty. Never review or revert unrelated changes as if they belong to the current task.
- When the worktree contains unrelated edits, scope peer review to the files changed for the current task.

## Execution Environment

- The devcontainer is the canonical runtime for this repo.
- The `devcontainer` CLI is installed on the host, and the container is already set up.
- Claude and Codex themselves run on the host.
- Run project tooling and runtime-dependent commands from the host with `devcontainer exec --workspace-folder . <command>`.
- Treat this as the default for `pnpm`, `node`, `astro`, `biome`, and any repo scripts or verification commands.
- Prefer `devcontainer exec` over rebuilding or reinitializing the container unless the task explicitly requires container setup work.
- Host-side exceptions include launching `claude` or `codex`, editing files, `git` inspection, and simple file reads that do not depend on the project runtime.
- When handing off to a peer agent, explicitly state that project tooling and verification must use the devcontainer wrapper.

## Driver Responsibilities

1. Classify the task as small, normal, or high-risk.
2. For high-risk work, ask the peer agent for a plan critique before editing.
3. Implement the smallest change that satisfies the request.
4. Run the narrowest relevant verification first, then broader checks when warranted.
5. Ask the peer agent for review before finalizing, unless the task is trivial.
6. Automatically fix objective bugs found by the reviewer.
7. Stop and ask the user when the remaining disagreement is architectural, stylistic, or product-directional.

## Reviewer Responsibilities

Prioritize:

- correctness bugs
- regressions
- edge cases
- missing validation or checks
- hidden coupling
- API, route, or config breakage
- maintenance risks that will be expensive to undo

Separate feedback into:

- `Blocking`: likely bug, regression, broken assumption, or clear missing verification
- `Non-blocking`: style, preference, optional refactor, or future-facing idea

Rules for reviewers:

- cite the file or files and explain why the issue matters
- do not ask for broad rewrites unless the current approach creates a real problem
- be explicit about whether a point is objective or opinionated
- if unsure, say what assumption would make the code safe or unsafe

## Discussion Protocol

- Prefer a short, structured exchange over a long debate.
- Default to one review round.
- One follow-up round is allowed if the driver needs clarification or wants the reviewer to re-check a fix.
- If disagreement remains after that, escalate to the user instead of having agents argue indefinitely.

## Decision Protocol

- If the reviewer finds a clear bug, fix it, rerun relevant checks, and continue.
- If the reviewer suggests a low-risk improvement that clearly strengthens correctness, apply it and mention it.
- If the reviewer suggests a different architecture without a clear correctness issue, do not silently pivot; summarize options and ask the user.
- If task intent becomes unclear, ask the user instead of letting agents infer product direction.

## Handoff Packet

When invoking the peer agent, include:

- task summary
- files changed or planned
- commands already run
- assumptions or constraints
- the exact review lens you want: plan critique, correctness review, architecture critique, and so on

## Suggested Peer Invocations

From Claude to Codex, pre-code critique:

```bash
codex exec -s read-only "Critique this plan before implementation.

Task:
<task>

Planned approach:
<plan>

If you need project tooling or runtime commands such as pnpm, node, astro, biome, or repo scripts, use devcontainer exec --workspace-folder . <command>.

Focus on hidden complexity, coupling, regression risk, and whether there is a simpler approach.
Return:
1. blocking concerns
2. non-blocking concerns
3. recommended adjustments"
```

From Claude to Codex, post-code review when the worktree was otherwise clean:

```bash
codex review --uncommitted "Review the current uncommitted changes.
If you need project tooling or verification such as pnpm, node, astro, biome, or repo scripts, use devcontainer exec --workspace-folder . <command>.
Focus on correctness, regressions, edge cases, missing verification, and maintainability risks.
Separate blocking issues from non-blocking suggestions."
```

From Claude to Codex, post-code review when the repo is already dirty or you only want a file-scoped review:

```bash
codex exec -s read-only "Review only the current task's changes in these files:
<file list>

Use git diff -- <file list> plus the current file contents.
If you need project tooling or verification such as pnpm, node, astro, biome, or repo scripts, use devcontainer exec --workspace-folder . <command>.
Focus on correctness, regressions, edge cases, missing verification, and maintainability risks.
Separate blocking issues from non-blocking suggestions.
Do not edit files."
```

From Codex to Claude, plan or architecture critique:

```bash
claude -p "Review this plan only. Do not edit files.

Task:
<task>

Planned approach:
<plan>

If you need project tooling or runtime commands such as pnpm, node, astro, biome, or repo scripts, use devcontainer exec --workspace-folder . <command>.

Focus on architectural risks, over-complexity, unclear assumptions, and simpler alternatives.
Separate objective concerns from optional suggestions."
```

From Codex to Claude, post-code review:

```bash
claude -p "Review the current task's changes only. Do not edit files.

Context:
<task summary>
Files:
<file list>
Checks already run:
<commands>

If you need project tooling or verification such as pnpm, node, astro, biome, or repo scripts, use devcontainer exec --workspace-folder . <command>.

Focus on correctness, regressions, maintainability risks, and whether the implementation matches the request.
Separate blocking issues from non-blocking suggestions."
```

## Default Biases For This Repo

- Prefer focused fixes over broad rewrites.
- Preserve existing worktree changes you did not make.
- Keep Astro content, schema, and config changes especially conservative.
- For UI work, check both visual intent and build or type health.
- For docs or workflow files, optimize for a repeatable collaboration loop rather than verbose theory.
