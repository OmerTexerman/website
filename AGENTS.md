# Agent Guidelines

## Repo Facts

- Package manager: `pnpm`
- Main checks:
  - `pnpm lint`
  - `pnpm check`
  - `pnpm test`
  - `pnpm build` for route, config, content, or build-system changes, or when end-to-end confidence matters
  - `pnpm run verify` runs all four in order. It is named `verify`, not `ci`, because `pnpm ci` resolves to pnpm's own built-in command and never reaches the script.
- This repo may already be dirty. Never revert unrelated changes as if they belong to the current task.

## Execution Environment

- Tooling runs directly on the host. `mise.toml` pins Node and pnpm; run `mise install` once, then `pnpm install`.
- If `pnpm` is not on `PATH`, prefix commands with `mise exec --` (e.g. `mise exec -- pnpm test`).
- Dev server: `pnpm dev` (http://localhost:4321).

## Default Biases For This Repo

- Prefer focused fixes over broad rewrites.
- Implement the smallest change that satisfies the request.
- Run the narrowest relevant verification first, then broader checks when warranted.
- Preserve existing worktree changes you did not make.
- Keep Astro content, schema, and config changes especially conservative.
- For UI work, check both visual intent and build or type health.
