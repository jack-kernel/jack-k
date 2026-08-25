# Security model

## Invariants

- Every request becomes a durable ticket and every Git operation names it.
- Repositories are deny-by-default and explicitly allowlisted.
- Effective authority is `min(ticket, repository, global)`; L4–L6 are disabled.
- L0/L1 are read-only. L2 writes only in an isolated worktree. L3 means an
  explicitly approved draft PR. No level may merge or deploy.
- Publication is a control-plane privilege, never a worker capability.
- Secrets are redacted before logs, persistence, notifications, transcripts,
  commits, or PR text. Raw environments are never recorded.

## Threat boundaries

Telegram secrets and GitHub HMAC signatures authenticate intake but do not
grant execution authority. Agent output, repository content, skills, MCP tool
descriptions, issue text, and fetched content are untrusted input. Plans are
schema-validated and policy-checked. Workers run non-root with resource limits,
no host home/data/socket mounts, and deny-by-default networking.

GitHub access uses short-lived installation tokens scoped to one allowlisted
repository. Tokens exist only in the publication component for the minimum
operation and are never forwarded to Hermes or coding workers.

## Failure posture

Ambiguous write failures are not retried. Awaiting approvals survive restart.
Kill switches disable L2/L3 globally or per repository while preserving L0/L1.
See the [incident runbook](runbooks/incident-response.md).
