# JACK-K

> **v0.2 is under development.** The current release is **v0.1.2**. The v0.2
> work is being delivered phase-by-phase; the existing SQLite runtime remains
> the supported baseline until the Postgres migration is complete. See the
> [architecture](docs/architecture.md), [security model](docs/security-model.md),
> and [deployment guide](docs/deployment.md).

JACK-K is a self-hosted repository agent platform.

Its job is simple to state and deliberately hard to misuse: receive a piece
of repository work, preserve the request as a durable ticket, give an agent an
isolated worktree with bounded authority, and require an explicit human
approval before the agent can publish a draft pull request.

JACK-K is the operational shell around the agent. The model may reason about
the work, but JACK-K owns the boundaries: which repository is allowed, which
files may be touched, which tools are available, which Git operations are
permitted, and whether approval is required.

## The core soul

> JACK-K turns intent into accountable change.

The system is built around five principles:

1. **Every action starts as a ticket.** Requests from Telegram and GitHub are
   normalized into the same durable workflow.
2. **State is recoverable.** SQLite provides the working projection while an
   append-only JSONL event stream records what happened.
3. **Work happens away from the source checkout.** Each ticket receives its
   own Git mirror and worktree.
4. **Authority is explicit and monotonic.** The effective authority is capped
   by both the ticket and the repository policy.
5. **Humans remain in the publication loop.** Analysis can prepare work, but
   only approved draft-PR mode may commit, push, and open a draft pull
   request.

## What happens to a ticket

```text
Telegram / GitHub issue
          |
          v
       received -> triaging -> planned -> executing
                                      |
                                      v
                             awaiting_approval
                              /             \
                         rejected        approved
                                           |
                                           v
                                  commit -> push -> draft PR
```

The ticket store also models `pr_open`, `merged`, and `failed` terminal or
follow-up states. JACK-K does not merge pull requests automatically.

## Architecture

| Component               | Responsibility                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/gateway`          | Hono HTTP boundary with `/health`, `/telegram`, and `/github` endpoints. Validates Telegram secrets, Telegram user allowlists, and GitHub HMAC signatures before creating tickets. |
| `apps/orchestrator`     | Polls received tickets, recovers interrupted work on boot, runs the selected executor, and processes approvals.                                                                    |
| `packages/ticket-store` | SQLite projection plus fsynced, append-only JSONL events for ticket state, approvals, claims, and authority assertions.                                                            |
| `packages/git-worker`   | Allowlist checks, mirrors, isolated worktrees, forbidden-path checks, commits, pushes, draft PR creation, and cleanup.                                                             |
| `packages/executors`    | Adapters for Claude Code and Codex, including bounded tool/sandbox arguments and structured result parsing.                                                                        |
| `packages/telegram`     | Ticket and approval parsing, Telegram notifications, and the approval keyboard.                                                                                                    |
| `packages/core`         | Shared ticket, repository, authority, executor, and state-transition contracts.                                                                                                    |
| `packages/config`       | Validates environment variables and the repository policy file.                                                                                                                    |

## Operating modes

JACK-K defaults to **analysis mode**. In this mode the executor is forced to
authority `L0`, approvals are recorded but never cause Git mutations, and the
system is safe to use while developing or evaluating an agent workflow.

Set `FORGE_MODE=draft-pr` only when the runtime is ready to create draft pull
requests. In draft-PR mode, the effective authority is the lower of the
ticket authority and the repository authority. The supervisor still requires
an `open_draft_pr` approval before committing, pushing, or opening a PR.

Authority gates currently enforced by the code are:

| Level     | Meaning in this release                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `L0`–`L1` | Executor is read-only (`Read`, `Glob`, and `Grep`; Codex uses a read-only sandbox). |
| `L2`      | Workspace writes and Git preparation/commit/push are available.                     |
| `L3`      | Opening a draft PR is available, subject to explicit approval.                      |
| `L4`–`L6` | Reserved for future higher-trust operations.                                        |

## Quick start

### Prerequisites

- Node.js 22 or newer
- pnpm 9.15.9 or a compatible pnpm 9 release
- Git
- Claude Code and/or Codex installed if you want to execute agent work
- GitHub CLI (`gh`) authenticated if you want to open draft PRs

### Install and configure

```bash
pnpm install
cp .env.example .env
```

Populate `.env` with real values. The applications read process environment
variables directly, so export the file before starting them:

```bash
set -a
source .env
set +a
```

Configure at least one allowlisted repository in `repos.yaml`:

```yaml
repos:
  - name: owner/example
    url: https://github.com/owner/example.git
    defaultBranch: main
    authority: 2
    forbiddenPaths:
      - .github/workflows/
      - infra/
    executor: claude-code
```

`executor` may be `claude-code` or `codex`. It defaults to `claude-code`.
Repository names in incoming tickets must exactly match an entry in this
file.

### Build and run

```bash
pnpm build
```

Run the gateway and orchestrator as separate processes:

```bash
pnpm --filter @jack-k/gateway start
```

```bash
pnpm --filter @jack-k/orchestrator start
```

The gateway listens on `127.0.0.1:8787` unless `PORT` is set. The orchestrator
polls every five seconds. Put a reverse proxy or secure tunnel in front of the
gateway when receiving external webhooks; the built-in checks authenticate
requests but do not provide TLS termination.

## Intake

### Telegram

The gateway accepts Telegram webhook updates at `POST /telegram` and requires
the `x-telegram-bot-api-secret-token` header. Only numeric IDs listed in
`TELEGRAM_ALLOWED_USER_IDS` may create tickets.

The ticket command is:

```text
/ticket owner/repository Describe the work to perform
```

The Telegram package defines approval callbacks with the actions `approve`,
`reject`, and `changes`.

### GitHub

The gateway accepts GitHub webhook payloads at `POST /github` and verifies the
`x-hub-signature-256` HMAC using `GITHUB_WEBHOOK_SECRET`. Only `opened` and
`reopened` issue events become tickets; other events are acknowledged and
ignored.

## Environment variables

| Variable                    | Purpose                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`        | Telegram bot token used for notifications.                                                     |
| `TELEGRAM_SECRET_TOKEN`     | Secret expected on Telegram webhook requests.                                                  |
| `TELEGRAM_ALLOWED_USER_IDS` | Comma-separated non-negative Telegram user IDs allowed to create tickets.                      |
| `GITHUB_WEBHOOK_SECRET`     | Secret used to verify GitHub webhook signatures.                                               |
| `FORGE_DATA_DIR`            | Runtime data directory for SQLite, event logs, mirrors, and worktrees. Defaults to `~/.forge`. |
| `REPOS_FILE`                | Repository policy file. Defaults to `repos.yaml`.                                              |
| `FORGE_MODE`                | `analysis` by default; set to `draft-pr` to enable approved draft-PR mutations.                |
| `PORT`                      | Gateway port. Defaults to `8787`.                                                              |

Never commit `.env`, bot tokens, webhook secrets, or runtime data. The
repository includes a pre-commit secret scan and version validation hook.

## Development commands

```bash
pnpm build
```

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

The project is a pnpm workspace with strict TypeScript packages under
`packages/` and runnable applications under `apps/`.

## Release management

Release metadata is managed by the verified MIT package
`@edcalderon/versioning@1.5.11`. The repository release workflow runs the
full build, typecheck, lint, test, secret, changelog, and version checks before
creating a commit and annotated tag.

```bash
pnpm release:dry-run 0.1.2
```

```bash
pnpm release 0.1.2
```

## 📋 Latest Changes (v0.1.2)

- Analysis mode now records approvals without allowing them to trigger Git
  mutations.

The current release is **v0.1.2**. See [CHANGELOG.md](./CHANGELOG.md) for the
version history and [GitHub releases](https://github.com/jack-kernel/jack-k/releases)
for published artifacts.

## Project status

JACK-K is an early, deliberately small platform. The core intake, durable
ticket workflow, authority boundary, isolated Git work, Claude/Codex adapters,
approval flow, and draft-PR path are implemented and tested.

The platform is not yet a general-purpose autonomous production operator. It
does not merge pull requests, deploy services, or infer permission from
natural language. Those capabilities should be added only as explicit,
tested authority gates.
