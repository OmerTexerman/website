@AGENTS.md

# Claude-Specific Notes

Use `AGENTS.md` as the shared source of truth. This file stays thin on purpose so the workflow policy only has one real home.

## Default Behavior In This Repo

- Use Codex as the default peer reviewer.
- Gemini is not available here. Skip Gemini-specific steps entirely.
- If the user starts with Claude, Claude is the driver for that task unless the user explicitly asks for review-only behavior.
- For normal tasks, implement first and ask Codex for review before finalizing.
- For high-risk tasks, ask Codex for a short pre-code critique and a post-code review.

## Execution Environment

- Treat the devcontainer as the canonical runtime for this repo.
- The `devcontainer` CLI is installed on the host, and the container is already provisioned.
- Claude runs on the host, and Codex should be launched from the host as well.
- Run project tooling and runtime-dependent commands with `devcontainer exec --workspace-folder . <command>`.
- Do not run bare host commands for repo tooling such as `pnpm`, `node`, `astro`, `biome`, or verification scripts.
- Prefer:
  - `devcontainer exec --workspace-folder . pnpm lint`
  - `devcontainer exec --workspace-folder . pnpm check`
  - `devcontainer exec --workspace-folder . pnpm build`
- Host-side exceptions include launching `codex`, editing files, `git` inspection, and simple file reads that do not depend on the runtime environment.
- When asking Codex to inspect, verify, or reproduce anything, explicitly tell it to use `devcontainer exec --workspace-folder . <command>` for project tooling and verification.

## How Claude Should Use Codex

- Prefer `codex review --uncommitted` only when the current task represents the full uncommitted diff.
- If the repo is already dirty, use `codex exec -s read-only` and explicitly scope the review to the files changed for the task.
- Tell Codex to separate `Blocking` issues from `Non-blocking` suggestions.
- If Codex finds a clear bug or missing verification, fix it automatically.
- If Codex proposes an architectural or stylistic alternative without a clear bug, stop and ask the user.
- If Codex is unsure, either clarify once or surface the uncertainty rather than forcing convergence.

## Claude Handoff Format To Codex

When invoking Codex, include:

- the task in 1 to 3 sentences
- files changed
- checks already run
- assumptions or open questions
- the exact review lens you want

## Recommended Commands

Plan critique before coding:

```bash
codex exec -s read-only "Critique this plan before implementation.

Task:
<task>

Planned approach:
<plan>

If you need project tooling or runtime commands such as pnpm, node, astro, biome, or repo scripts, use devcontainer exec --workspace-folder . <command>.

Focus on hidden complexity, risky coupling, and simpler alternatives.
Return blocking concerns first."
```

Diff review when the current task is the whole diff:

```bash
codex review --uncommitted "Review the current uncommitted changes.
If you need project tooling or verification such as pnpm, node, astro, biome, or repo scripts, use devcontainer exec --workspace-folder . <command>.
Focus on correctness, regressions, edge cases, missing verification, and maintainability risks.
Separate blocking issues from non-blocking suggestions."
```

Diff review when the repo is already dirty:

```bash
codex exec -s read-only "Review only the current task's changes in these files:
<file list>

Use git diff -- <file list> and inspect the current file contents.
If you need project tooling or verification such as pnpm, node, astro, biome, or repo scripts, use devcontainer exec --workspace-folder . <command>.
Focus on correctness, regressions, edge cases, missing verification, and maintainability risks.
Separate blocking issues from non-blocking suggestions.
Do not edit files."
```
