# JACK-K v0.2 architecture

JACK-K is the authority kernel: intake and subordinate runtimes propose work;
the kernel owns durable state, policy evaluation, authority, approval, and
publication. It is deliberately not a general autonomous agent.

```text
Telegram/GitHub -> gateway -> ticket + audit event -> orchestrator
                                                    | planning (Hermes ACP, L0/L1)
                                                    | isolated worker (Codex/Claude, L2)
                                                    | verification + review
operator approval -> publication service -> scoped GitHub App -> draft PR
```

Postgres will be the operational system of record in v0.2. The append-only,
fsynced JSONL stream remains independent audit evidence. Large transcripts and
logs are content-addressed artifacts; operational records contain references
and hashes. Neither store may contain unredacted credentials.

The control plane runs in a locked, headless NixOS guest on the Linux host;
durable state is mounted explicitly outside the immutable Nix store. This
deployment boundary does not replace execution isolation. Every write-capable
run gets one short-lived, non-root worker with only its ticket worktree mounted.
Network defaults off. Workers cannot receive a container/hypervisor socket or
publication credentials. The initial backend is tracked by JK-005; a
Nix-declared per-ticket microVM backend is gated separately by JK-023. The
control plane alone commits, pushes, and creates a **draft** PR after explicit
approval; it never merges. See the [NixOS baseline](specs/nixos-runtime-baseline.md).

The rollout is sequential. `.agents/active-task`, `.agents/pending-task`, and
`.agents/done-task` are the repository task ledger. A phase moves forward only
with automated tests and acceptance evidence for the preceding phase.
