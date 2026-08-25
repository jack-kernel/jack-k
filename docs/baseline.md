# Phase 0 baseline evidence

Recorded on 2026-08-25 before v0.2 changes, from the clean `work` branch at the commit from which `feat/v0-2-agent-runtime` was created.

| Check            | Result                        |
| ---------------- | ----------------------------- |
| `pnpm build`     | passed: 9/9 tasks             |
| `pnpm typecheck` | passed: 15/15 tasks           |
| `pnpm lint`      | passed: 15/15 tasks           |
| `pnpm test`      | passed: 15/15 tasks; 34 tests |

The container supplied Node 20.20.2 although the project requires Node 22, so pnpm emitted an unsupported-engine warning. The checks nevertheless passed. Local and deployment images use Node 22.
