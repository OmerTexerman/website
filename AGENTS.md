# Agent Guidelines

## Repo Facts

- Package manager: `pnpm`
- Main checks:
  - `devcontainer exec --workspace-folder . pnpm lint`
  - `devcontainer exec --workspace-folder . pnpm check`
  - `devcontainer exec --workspace-folder . pnpm build` for route, config, content, or build-system changes, or when end-to-end confidence matters
- This repo may already be dirty. Never revert unrelated changes as if they belong to the current task.

## Execution Environment

- The devcontainer is the canonical runtime for this repo.
- The `devcontainer` CLI is installed on the host, and the container is already set up.
- Run project tooling and runtime-dependent commands from the host with `devcontainer exec --workspace-folder . <command>`.
- Treat this as the default for `pnpm`, `node`, `astro`, `biome`, and any repo scripts or verification commands.
- Prefer `devcontainer exec` over rebuilding or reinitializing the container unless the task explicitly requires container setup work.
- Host-side exceptions include editing files, `git` inspection, and simple file reads that do not depend on the project runtime.

## Default Biases For This Repo

- Prefer focused fixes over broad rewrites.
- Implement the smallest change that satisfies the request.
- Run the narrowest relevant verification first, then broader checks when warranted.
- Preserve existing worktree changes you did not make.
- Keep Astro content, schema, and config changes especially conservative.
- For UI work, check both visual intent and build or type health.
